package com.rooiam.sdk;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import org.json.JSONObject;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Blocking device-login client. Run network/crypto methods on a worker thread.
 * One enrollment per application installation. Never expose keys or tokens to UI code.
 */
public final class RooiamClient {
    public interface SessionCookies { String getCookie(String trustedOrigin); }
    public interface AttestationProvider { String requestToken(String requestHash) throws Exception; }
    private final DeviceVault vault;
    private final Api api;
    private final String origin, appId;
    private final boolean debug;
    public RooiamClient(Context context, String origin, SessionCookies cookies) {
        this(context, origin, cookies, false);
    }
    /** Local preview opt-in is accepted only in a debuggable host app. */
    public RooiamClient(Context context, String origin, SessionCookies cookies, boolean localPreview) {
        if (localPreview && (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0)
            throw new IllegalArgumentException("Local preview requires a debuggable application.");
        this.debug = localPreview;
        this.origin = Protocol.origin(origin, localPreview);
        this.appId = context.getPackageName();
        this.vault = new DeviceVault(context);
        this.api = new Api(this.origin, localPreview, java.util.Objects.requireNonNull(cookies));
    }
    public String getOrigin() { return origin; }
    public String hostedLoginOrigin() throws Exception {
        return Protocol.origin(api.request("/v1/setup/public-urls", null).getString("frontend_url"), debug);
    }
    public synchronized Enrollment enroll(String label, AttestationProvider attestation) throws Exception {
        String user = api.request("/v1/identity/me", null).getString("id");
        JSONObject existing = vault.load();
        if (existing != null && existing.has("id")) throw new IllegalStateException("This phone is already enrolled. Revoke it before switching accounts or servers.");
        JSONObject device = existing;
        if (device == null) { device = vault.generate(origin, user); vault.save(device); }
        if (!device.getString("origin").equals(origin) || !device.getString("user_id").equals(user)) throw new IllegalStateException("Enrollment belongs to another account or server.");
        // Recover enrollment when the server committed but the previous response was lost.
        org.json.JSONArray devices = api.request("/v1/identity/me/devices", null).getJSONArray("items");
        for (int i = 0; i < devices.length(); i++) {
            JSONObject registered = devices.getJSONObject(i);
            if (device.getString("device_public_key").equals(registered.optString("device_public_key")) && registered.isNull("revoked_at")) {
                device.put("id", registered.getString("id")); vault.save(device); return new Enrollment(device.getString("id"), "unknown", true);
            }
        }
        JSONObject body = new JSONObject().put("device_label", label)
            .put("platform", "android").put("device_token", device.getString("device_token")).put("device_public_key", device.getString("device_public_key"));
        if (attestation != null) {
            String keyId = device.optString("key_id", UUID.randomUUID().toString()); device.put("key_id", keyId); vault.save(device);
            String preimage = "rooiam-google-play-attestation/v1\n" + device.getString("device_public_key") + "\n" + appId + "\n" + keyId + "\nproduction";
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(preimage.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(); for (byte value : digest) hash.append(String.format("%02x", value & 255));
            body.put("attestation", new JSONObject().put("format", "android-play-integrity").put("key_id", keyId).put("app_id", appId).put("environment", "production").put("statement", attestation.requestToken(hash.toString())));
        } else if (!debug) { throw new IllegalStateException("An attestation provider is required for release enrollment."); }
        JSONObject result = api.request("/v1/identity/me/devices", body);
        device.put("id", result.getString("id")); vault.save(device);
        return new Enrollment(result.getString("id"), result.getJSONObject("attestation").getString("status"), false);
    }

    public static final class Enrollment {
        public final String deviceId, attestationStatus;
        public final boolean recovered;
        private Enrollment(String id, String status, boolean recovered) { this.deviceId = id; this.attestationStatus = status; this.recovered = recovered; }
    }

    private JSONObject enrolled() throws Exception {
        JSONObject device = vault.load();
        if (device == null || !device.has("id")) throw new IllegalStateException("Enroll this phone first.");
        if (!device.getString("origin").equals(origin)) throw new IllegalStateException("Use the server where this phone was enrolled.");
        if (!device.getString("user_id").equals(api.request("/v1/identity/me", null).getString("id")))
            throw new IllegalStateException("Sign in as the account that enrolled this phone.");
        return device;
    }
    public synchronized Review preview(String qr) throws Exception {
        String id = Protocol.parseQr(qr, origin, debug); // Before sending any credentials.
        JSONObject device = enrolled();
        JSONObject request = api.request("/v1/identity/device-login/intents/" + id, null);
        if (request.optInt("protocol_version", 0) != 1 || !id.equals(request.getString("public_id")) || !"pending".equals(request.getString("status")))
            throw new IllegalStateException("This request is unavailable or uses an unsupported protocol.");
        Review review = new Review(this, device.getString("id"), request);
        review.requireUnexpired();
        return review;
    }
    public synchronized ActionReview previewAction(String qr) throws Exception {
        String id = Protocol.parseActionQr(qr, origin, debug);
        JSONObject device = enrolled();
        JSONObject request = api.request("/v1/identity/action-approvals/" + id, null);
        if (request.optInt("protocol_version", 0) != 1 || !origin.equals(Protocol.origin(request.getString("server_origin"), debug)) || !id.equals(request.getString("id")) ||
            !"workspace.api_key.create".equals(request.optString("action")) || !"pending".equals(request.optString("status")))
            throw new IllegalStateException("This action request is unavailable or uses an unsupported protocol.");
        ActionReview review = new ActionReview(this, device.getString("id"), request);
        review.requireUnexpired();
        return review;
    }
    /** Explicitly approve the reviewed action. Never retry an ambiguous network result. */
    public synchronized void approveAction(ActionReview review, String displayedCode) throws Exception { decideAction(review, true, displayedCode); }
    public synchronized void denyAction(ActionReview review) throws Exception { decideAction(review, false, null); }
    private void decideAction(ActionReview review, boolean approve, String displayedCode) throws Exception {
        if (review.owner != this || review.used) throw new IllegalStateException("Preview this request again.");
        review.requireUnexpired();
        JSONObject device = enrolled();
        if (!device.getString("id").equals(review.deviceId)) throw new IllegalStateException("Enrollment changed. Scan again.");
        if (approve && !review.getDisplayCode().equals(displayedCode)) throw new IllegalArgumentException("Request code differs.");
        JSONObject body = new JSONObject().put("id", review.request.getString("id"))
            .put("device_token", device.getString("device_token"));
        if (approve) body.put("display_code", displayedCode)
            .put("approval_signature", vault.sign(device, review.request.getString("approval_payload")));
        review.used = true;
        api.request("/v1/identity/action-approvals/" + (approve ? "approve" : "deny"), body);
    }
    public static final class ActionReview {
        private final RooiamClient owner;
        private final String deviceId;
        private final JSONObject request;
        private boolean used;
        private ActionReview(RooiamClient owner, String deviceId, JSONObject request) { this.owner = owner; this.deviceId = deviceId; this.request = request; }
        private void requireUnexpired() throws Exception {
            if (!java.time.Instant.parse(request.getString("expires_at")).isAfter(java.time.Instant.now()))
                throw new IllegalStateException("Request expired. Start again in the browser.");
        }
        public String getOrigin() { return owner.origin; }
        public String getWorkspace() { return request.optString("workspace_name", ""); }
        public String getAction() { return "Create workspace API key"; }
        public String getLabel() { return request.optString("label", ""); }
        public String getPermissionPreset() { return request.optString("permission_preset", ""); }
        public String getPermissions() {
            org.json.JSONArray values = request.optJSONArray("allowed_permissions");
            if (values == null) return "";
            StringBuilder result = new StringBuilder();
            for (int i = 0; i < values.length(); i++) { if (i > 0) result.append(", "); result.append(values.optString(i)); }
            return result.toString();
        }
        public String getKeyExpiry() { return request.isNull("key_expires_at") ? "Never" : request.optString("key_expires_at", "Never"); }
        public String getDisplayCode() { return request.optString("display_code", ""); }
    }
    /** Call only after explicit user confirmation of the displayed code and number. No retry. */
    public synchronized void approve(Review review, int selectedNumber) throws Exception { decide(review, true, selectedNumber); }
    public synchronized void deny(Review review) throws Exception { decide(review, false, 0); }
    private void decide(Review review, boolean approve, int selectedNumber) throws Exception {
        if (review.owner != this || review.used) throw new IllegalStateException("Preview this request again.");
        review.requireUnexpired();
        JSONObject device = enrolled();
        if (!device.getString("id").equals(review.deviceId)) throw new IllegalStateException("Enrollment changed. Scan again.");
        if (approve && selectedNumber != review.getMatchNumber()) throw new IllegalArgumentException("Matching number differs.");
        JSONObject body = new JSONObject().put("public_id", review.request.getString("public_id")).put("device_token", device.getString("device_token"));
        if (approve) body.put("selected_number", selectedNumber).put("approval_signature", vault.sign(device, review.request.getString("approval_payload")));
        review.used = true; // Ambiguous failures require a new preview, never an automatic retry.
        api.request("/v1/identity/device-login/" + (approve ? "approve" : "reject"), body);
    }
    public synchronized void revoke() throws Exception {
        JSONObject device = enrolled();
        api.request("/v1/identity/me/devices/" + device.getString("id"), "DELETE", null);
        vault.clear();
    }
    /** Immutable public review context; credentials and signing payload remain internal. */
    public static final class Review {
        private final RooiamClient owner;
        private final String deviceId;
        private final JSONObject request;
        private boolean used;
        private Review(RooiamClient owner, String deviceId, JSONObject request) { this.owner = owner; this.deviceId = deviceId; this.request = request; }
        private void requireUnexpired() throws Exception {
            if (!java.time.Instant.parse(request.getString("expires_at")).isAfter(java.time.Instant.now())) throw new IllegalStateException("Request expired. Start again in the browser.");
        }
        public String getOrigin() { return owner.origin; }
        public String getApplication() { return request.optString("redirect_uri", "Rooiam portal"); }
        public String getWorkspace() { return request.optString("workspace_id", "Rooiam"); }
        public String getDisplayCode() { return request.optString("display_code"); }
        public int getMatchNumber() { return request.optInt("match_number"); }
    }
}
