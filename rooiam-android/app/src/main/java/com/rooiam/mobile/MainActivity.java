package com.rooiam.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.gms.tasks.Tasks;
import org.json.JSONObject;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private DeviceVault vault;
    private EditText server, project;
    private TextView status;
    private LinearLayout layout;
    private boolean busy;
    interface Work { String run() throws Exception; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        vault = new DeviceVault(this); home();
    }
    private void home() {
        layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32,48,32,32);
        ScrollView scroll = new ScrollView(this); scroll.addView(layout); setContentView(scroll);
        TextView title = new TextView(this); title.setText("Rooiam\nScan. Match. Approve."); title.setTextSize(26); layout.addView(title);
        server = new EditText(this); server.setHint("https://your-rooiam-api.example"); server.setSingleLine(true);
        server.setText(getPreferences(0).getString("server", "")); layout.addView(server);
        project = new EditText(this); project.setHint("Google Cloud project number (operator provides)"); project.setInputType(2);
        project.setText(getPreferences(0).getString("project", "")); layout.addView(project);
        button("1. Sign in to Rooiam", () -> work(() -> {
            String origin = serverOrigin();
            String frontend = Protocol.origin(new Api(origin).request("/v1/setup/public-urls", null).getString("frontend_url"), BuildConfig.DEBUG);
            runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Sign in to your server")
                .setMessage("API: " + origin + "\nLogin: " + frontend)
                .setPositiveButton("Continue", (d,w) -> login(frontend)).setNegativeButton("Cancel", null).show());
            return "Sign in using an existing account, then return here to enroll.";
        }));
        button("2. Enroll this phone", () -> work(this::enroll));
        button("3. Scan a sign-in QR", () -> {
            if (busy) return;
            GmsBarcodeScanning.getClient(this).startScan().addOnSuccessListener(code -> preview(code.getRawValue()))
                .addOnFailureListener(e -> status.setText("Scanner unavailable: " + e.getMessage()));
        });
        button("Paste QR text", () -> {
            EditText input = new EditText(this); input.setHint("rooiam://device-login?…");
            new AlertDialog.Builder(this).setTitle("Sign-in request").setView(input).setPositiveButton("Preview", (d,w) -> preview(input.getText().toString())).setNegativeButton("Cancel", null).show();
        });
        button("Revoke this phone", () -> new AlertDialog.Builder(this).setTitle("Revoke this phone?")
            .setMessage("You will need to enroll again before approving requests.")
            .setPositiveButton("Revoke", (d,w) -> work(() -> {
                JSONObject device = enrolled();
                new Api(device.getString("origin")).request("/v1/identity/me/devices/" + device.getString("id"), "DELETE", null);
                vault.clear(); return "Phone revoked. You can enroll it again.";
            })).setNegativeButton("Cancel", null).show());
        status = new TextView(this); status.setText("Enroll your phone with the server you trust. Only approve sign-ins you started."); status.setPadding(0,24,0,0); layout.addView(status);
    }
    private void button(String label, Runnable action) { Button b = new Button(this); b.setText(label); b.setOnClickListener(v -> action.run()); layout.addView(b); }
    private String configuredOrigin;
    private String configuredProject;
    private void work(Work action) {
        if (busy) return;
        // Read views on the UI thread, then perform all crypto/network work off it.
        configuredOrigin = server.getText().toString(); configuredProject = project.getText().toString();
        busy = true; status.setText("Working…");
        worker.execute(() -> {
            String result;
            try { result = action.run(); } catch (Exception e) { result = e.getMessage() == null ? "Operation failed. Try again." : e.getMessage(); }
            String message = result;
            runOnUiThread(() -> { busy = false; if (!isFinishing()) status.setText(message); });
        });
    }
    private String serverOrigin() {
        String origin = Protocol.origin(configuredOrigin, BuildConfig.DEBUG);
        getPreferences(0).edit().putString("server", origin).putString("project", configuredProject).apply(); return origin;
    }
    private void login(String frontend) {
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        Button done = new Button(this); done.setText("Return to phone enrollment"); panel.addView(done);
        Button openLink = new Button(this); openLink.setText("Paste your email sign-in link"); panel.addView(openLink);
        WebView web = new WebView(this); panel.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false); web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest req) {
                String scheme = req.getUrl().getScheme();
                return !("https".equals(scheme) || (BuildConfig.DEBUG && "http".equals(scheme) && "127.0.0.1".equals(req.getUrl().getHost())));
            }
        });
        done.setOnClickListener(v -> { CookieManager.getInstance().flush(); web.destroy(); home(); });
        openLink.setOnClickListener(v -> {
            EditText input = new EditText(this); input.setHint("Paste the sign-in link from your email");
            new AlertDialog.Builder(this).setTitle("Open your sign-in link").setView(input)
                .setPositiveButton("Open", (d,w) -> {
                    try {
                        java.net.URI link = new java.net.URI(input.getText().toString().trim());
                        if (link.getRawUserInfo() != null || !frontend.equals(Protocol.origin(link.getScheme() + "://" + link.getRawAuthority(), BuildConfig.DEBUG))) throw new IllegalArgumentException();
                        web.loadUrl(link.toASCIIString());
                    } catch (Exception e) { new AlertDialog.Builder(this).setMessage("Use a sign-in link from " + frontend).setPositiveButton("OK", null).show(); }
                }).setNegativeButton("Cancel", null).show();
        });
        setContentView(panel); web.loadUrl(frontend + "/");
    }
    private String enroll() throws Exception {
        String origin = serverOrigin(); Api api = new Api(origin);
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
                device.put("id", registered.getString("id")); vault.save(device); return "Recovered existing phone enrollment.";
            }
        }
        JSONObject body = new JSONObject().put("device_label", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
            .put("platform", "android").put("device_token", device.getString("device_token")).put("device_public_key", device.getString("device_public_key"));
        if (!configuredProject.trim().isEmpty()) {
            String keyId = device.optString("key_id", UUID.randomUUID().toString()); device.put("key_id", keyId); vault.save(device);
            String preimage = "rooiam-google-play-attestation/v1\n" + device.getString("device_public_key") + "\n" + getPackageName() + "\n" + keyId + "\nproduction";
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(preimage.getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(); for (byte b : digest) hash.append(String.format("%02x", b & 255));
            StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(this);
            StandardIntegrityManager.StandardIntegrityTokenProvider provider = Tasks.await(manager.prepareIntegrityToken(StandardIntegrityManager.PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(Long.parseLong(configuredProject)).build()), 60, java.util.concurrent.TimeUnit.SECONDS);
            String token = Tasks.await(provider.request(StandardIntegrityManager.StandardIntegrityTokenRequest.builder().setRequestHash(hash.toString()).build()), 60, java.util.concurrent.TimeUnit.SECONDS).token();
            body.put("attestation", new JSONObject().put("format", "android-play-integrity").put("key_id", keyId).put("app_id", getPackageName()).put("environment", "production").put("statement", token));
        } else if (!BuildConfig.DEBUG) { throw new IllegalStateException("Your operator must provide a Play Integrity project number for release enrollment."); }
        JSONObject result = api.request("/v1/identity/me/devices", body);
        device.put("id", result.getString("id")); vault.save(device);
        return "Phone enrolled. Attestation: " + result.getJSONObject("attestation").getString("status") + ". Approval remains subject to server policy.";
    }
    private JSONObject enrolled() throws Exception {
        JSONObject device = vault.load(); if (device == null || !device.has("id")) throw new IllegalStateException("Enroll this phone first.");
        if (!device.getString("origin").equals(serverOrigin())) throw new IllegalStateException("Use the server where this phone was enrolled.");
        JSONObject user = new Api(device.getString("origin")).request("/v1/identity/me", null);
        if (!device.getString("user_id").equals(user.getString("id"))) throw new IllegalStateException("Sign in as the account that enrolled this phone.");
        return device;
    }
    private void preview(String qr) {
        work(() -> {
            if (qr == null) throw new IllegalArgumentException("Empty QR code.");
            // Origin validation happens before even the identity request sends credentials.
            String id = Protocol.parseQr(qr, serverOrigin(), BuildConfig.DEBUG);
            JSONObject device = enrolled(); Api api = new Api(device.getString("origin"));
            JSONObject request = api.request("/v1/identity/device-login/intents/" + id, null);
            if (request.optInt("protocol_version", 0) != 1 || !request.getString("public_id").equals(id) || !request.getString("status").equals("pending")) throw new IllegalStateException("This request is unavailable or uses an unsupported protocol.");
            if (java.time.Instant.parse(request.getString("expires_at")).isBefore(java.time.Instant.now())) throw new IllegalStateException("This request expired.");
            runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Approve this browser?")
                .setMessage("Server: " + device.optString("origin") + "\nApplication: " + request.optString("redirect_uri", "Rooiam portal") + "\nWorkspace: " + request.optString("workspace_id", "Rooiam") + "\n\nRequest code: " + request.optString("display_code") + "\nMatching number: " + request.optInt("match_number") + "\n\nCompare the request code and number with the browser you started.")
                .setPositiveButton("Codes match — approve", (d,w) -> decide(device, request, true))
                .setNegativeButton("Deny", (d,w) -> decide(device, request, false)).setNeutralButton("Close", null).show());
            return "Review the server, request code and number before approving.";
        });
    }
    private void decide(JSONObject device, JSONObject request, boolean approve) {
        work(() -> {
            if (java.time.Instant.parse(request.getString("expires_at")).isBefore(java.time.Instant.now())) throw new IllegalStateException("Request expired. Start again in the browser.");
            JSONObject body = new JSONObject().put("public_id", request.getString("public_id")).put("device_token", device.getString("device_token"));
            if (approve) body.put("selected_number", request.getInt("match_number")).put("approval_signature", vault.sign(device, request.getString("approval_payload")));
            new Api(device.getString("origin")).request("/v1/identity/device-login/" + (approve ? "approve" : "reject"), body);
            return approve ? "Approved. Return to your browser to finish sign-in and any required MFA." : "Request denied.";
        });
    }
    @Override protected void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
