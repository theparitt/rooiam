package com.rooiam.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.*;
import android.Manifest;
import android.content.pm.PackageManager;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import com.google.zxing.BarcodeFormat;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.gms.tasks.Tasks;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import com.rooiam.sdk.RooiamClient;
import com.rooiam.sdk.Protocol;

public final class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private EditText server, project;
    private TextView status;
    private LinearLayout layout;
    private boolean busy;
    private DecoratedBarcodeView scanner;
    private boolean scanning;
    private String pendingQr;
    private AlertDialog reviewDialog;
    private boolean resumed, refreshReview;
    private int reviewGeneration;
    private static final String UNCERTAIN_DECISION = "The last decision may have reached the server. Check your browser. If sign-in did not finish, start a new request there and scan again. This app will not resend the decision.";
    interface Work { String run() throws Exception; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        home();
        pendingQr = getPreferences(0).getString("pending_qr", null);
        refreshReview = pendingQr != null;
        if (getPreferences(0).getBoolean("decision_in_flight", false)) status.setText(UNCERTAIN_DECISION);
        if (pendingQr == null && state != null && state.getBoolean("scanning")) {
            status.post(this::startScanner);
        }
    }
    private void home() {
        layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32,48,32,32);
        ScrollView scroll = new ScrollView(this); scroll.addView(layout); setContentView(scroll);
        TextView title = new TextView(this); title.setText("Rooiam Reference\nScan. Match. Approve."); title.setTextSize(26); layout.addView(title);
        server = new EditText(this); server.setHint("https://your-rooiam-api.example"); server.setSingleLine(true);
        server.setText(getPreferences(0).getString("server", "")); layout.addView(server);
        project = new EditText(this); project.setHint("Google Cloud project number (operator provides)"); project.setInputType(2);
        project.setText(getPreferences(0).getString("project", "")); layout.addView(project);
        button("1. Sign in to Rooiam", () -> work(() -> {
            String origin = serverOrigin();
            String frontend = client().hostedLoginOrigin();
            runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Sign in to your server")
                .setMessage("API: " + origin + "\nLogin: " + frontend)
                .setPositiveButton("Continue", (d,w) -> login(frontend)).setNegativeButton("Cancel", null).show());
            return "Sign in using an existing account, then return here to enroll.";
        }));
        button("2. Enroll this phone", () -> work(this::enroll));
        button("3. Scan a sign-in QR", this::startScanner);
        button("Paste QR text", () -> {
            EditText input = new EditText(this); input.setHint("rooiam://device-login?…");
            new AlertDialog.Builder(this).setTitle("Sign-in request").setView(input).setPositiveButton("Preview", (d,w) -> preview(input.getText().toString())).setNegativeButton("Cancel", null).show();
        });
        button("Revoke this phone", () -> new AlertDialog.Builder(this).setTitle("Revoke this phone?")
            .setMessage("You will need to enroll again before approving requests.")
            .setPositiveButton("Revoke", (d,w) -> work(() -> {
                client().revoke(); return "Phone revoked. You can enroll it again.";
            })).setNegativeButton("Cancel", null).show());
        status = new TextView(this); status.setText("Enroll your phone with the server you trust. Only approve sign-ins you started."); status.setPadding(0,24,0,0); layout.addView(status);
    }
    private void button(String label, Runnable action) { Button b = new Button(this); b.setText(label); b.setOnClickListener(v -> action.run()); layout.addView(b); }
    private void startScanner() {
        if (busy || isFinishing() || isDestroyed()) return;
        try {
            String origin = Protocol.origin(server.getText().toString(), BuildConfig.DEBUG);
            getPreferences(0).edit().putString("server", origin).putString("project", project.getText().toString()).apply();
        } catch (Exception e) { status.setText(e.getMessage()); return; }
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 42); return;
        }
        scanning = true;
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        Button cancel = new Button(this); cancel.setText("Cancel scan"); panel.addView(cancel);
        scanner = new DecoratedBarcodeView(this);
        scanner.getBarcodeView().setDecoderFactory(new DefaultDecoderFactory(java.util.Collections.singletonList(BarcodeFormat.QR_CODE)));
        scanner.setStatusText("Scan the QR in the browser you started.");
        panel.addView(scanner, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(panel);
        cancel.setOnClickListener(v -> { stopScanner(); home(); status.setText("Scan cancelled. You can scan again or paste QR text."); });
        scanner.decodeSingle(result -> {
            if (!scanning || isFinishing() || isDestroyed()) return;
            String qr = result.getText(); stopScanner(); home(); preview(qr);
        });
        scanner.resume();
    }
    private void stopScanner() {
        if (scanner != null) { scanner.pause(); scanner = null; }
        scanning = false;
    }
    private void clearPendingQr() {
        if (isDestroyed()) return; // A replaced activity must not erase the new activity's review.
        pendingQr = null; getPreferences(0).edit().remove("pending_qr").commit();
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == 42) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startScanner();
            else status.setText("Camera permission was not granted. Use Paste QR text, or allow Camera in app settings.");
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) { state.putBoolean("scanning", scanning); super.onSaveInstanceState(state); }
    private void refreshPendingReview() {
        if (resumed && !busy && refreshReview && pendingQr != null) {
            refreshReview = false;
            preview(pendingQr);
        }
    }
    @Override protected void onResume() {
        super.onResume(); resumed = true;
        if (scanner != null) scanner.resume();
        refreshPendingReview();
    }
    @Override protected void onPause() {
        resumed = false; reviewGeneration++;
        if (pendingQr != null) refreshReview = true;
        if (reviewDialog != null) { reviewDialog.dismiss(); reviewDialog = null; }
        if (scanner != null) scanner.pause();
        CookieManager.getInstance().flush(); super.onPause();
    }
    @Override public void onBackPressed() { if (scanning) { stopScanner(); home(); } else super.onBackPressed(); }
    private String configuredOrigin;
    private String configuredProject;
    private void work(Work action) {
        work(action, null);
    }
    private void work(Work action, Runnable success) {
        if (busy) return;
        // Read views on the UI thread, then perform all crypto/network work off it.
        configuredOrigin = server.getText().toString(); configuredProject = project.getText().toString();
        busy = true; status.setText("Working…");
        worker.execute(() -> {
            String result;
            boolean succeeded = false;
            try { result = action.run(); succeeded = true; } catch (Exception e) { result = e.getMessage() == null ? "Operation failed. Try again." : e.getMessage(); }
            String message = result;
            boolean done = succeeded;
            runOnUiThread(() -> {
                busy = false;
                if (!isFinishing() && !isDestroyed()) {
                    if (done && success != null) success.run();
                    status.setText(message); refreshPendingReview();
                }
            });
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
                        web.loadUrl(Protocol.emailLink(link.toASCIIString(), frontend, getPreferences(0).getString("server", ""), BuildConfig.DEBUG));
                    } catch (Exception e) { new AlertDialog.Builder(this).setMessage("Use a sign-in link from " + frontend).setPositiveButton("OK", null).show(); }
                }).setNegativeButton("Cancel", null).show();
        });
        setContentView(panel); web.loadUrl(frontend + "/");
    }
    private RooiamClient client() {
        return new RooiamClient(this, serverOrigin(), origin -> CookieManager.getInstance().getCookie(origin), BuildConfig.DEBUG);
    }
    private String enroll() throws Exception {
        RooiamClient.AttestationProvider attestation = null;
        if (!configuredProject.trim().isEmpty()) {
            long projectNumber = Long.parseLong(configuredProject);
            attestation = hash -> {
                StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(getApplicationContext());
                StandardIntegrityManager.StandardIntegrityTokenProvider provider = Tasks.await(manager.prepareIntegrityToken(StandardIntegrityManager.PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(projectNumber).build()), 60, java.util.concurrent.TimeUnit.SECONDS);
                return Tasks.await(provider.request(StandardIntegrityManager.StandardIntegrityTokenRequest.builder().setRequestHash(hash).build()), 60, java.util.concurrent.TimeUnit.SECONDS).token();
            };
        }
        RooiamClient.Enrollment result = client().enroll(android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL, attestation);
        return result.recovered ? "Recovered existing phone enrollment." :
            "Phone enrolled. Attestation: " + result.attestationStatus + ". Approval remains subject to server policy.";
    }
    private void preview(String qr) {
        if (busy) return;
        int generation = reviewGeneration;
        try {
            Protocol.parseQr(qr, server.getText().toString(), BuildConfig.DEBUG);
            pendingQr = qr;
            if (!getPreferences(0).edit().putString("pending_qr", qr).commit()) throw new IllegalStateException("Could not save the scan. Please scan again.");
        } catch (Exception e) { clearPendingQr(); status.setText(e.getMessage()); return; }
        work(() -> {
            try {
            RooiamClient sdk = client();
            RooiamClient.Review request = sdk.preview(qr);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed() || !resumed || generation != reviewGeneration) return;
                reviewDialog = new AlertDialog.Builder(this).setTitle("Approve this browser?")
                .setMessage("Server: " + request.getOrigin() + "\nApplication: " + request.getApplication() + "\nWorkspace: " + request.getWorkspace() + "\n\nRequest code: " + request.getDisplayCode() + "\nMatching number: " + request.getMatchNumber() + "\n\nCompare the request code and number with the browser you started.")
                .setPositiveButton("Codes match — approve", (d,w) -> decide(sdk, request, true))
                .setNegativeButton("Deny", (d,w) -> decide(sdk, request, false))
                .setNeutralButton("Close", (d,w) -> clearPendingQr()).setOnCancelListener(d -> clearPendingQr()).show();
            });
            return "Review the server, request code and number before approving.";
            } catch (Exception e) {
                // Keep only the public QR after a transport failure so reopening can
                // fetch a fresh review. Never retain a signed decision for retry.
                runOnUiThread(() -> {
                    if (!isDestroyed() && generation == reviewGeneration && !(e instanceof java.io.IOException)) clearPendingQr();
                });
                if (e instanceof java.io.IOException) throw new IllegalStateException("Cannot reach your server. Check the connection and reopen the app to refresh this request.");
                throw e;
            }
        });
    }
    private void decide(RooiamClient sdk, RooiamClient.Review request, boolean approve) {
        if (busy) return;
        // Persist ambiguity BEFORE sending. Process death must never look like a
        // successful decision or cause an automatic replay on the next launch.
        if (!getPreferences(0).edit().remove("pending_qr").putBoolean("decision_in_flight", true).commit()) {
            status.setText("Could not save decision state. Reopen the app and scan again."); return;
        }
        pendingQr = null; refreshReview = false;
        work(() -> {
            try {
                if (approve) sdk.approve(request, request.getMatchNumber()); else sdk.deny(request);
            } catch (Exception e) { throw new IllegalStateException(UNCERTAIN_DECISION); }
            return approve ? "Approved. Return to your browser to finish sign-in and any required MFA." : "Request denied.";
        }, () -> getPreferences(0).edit().remove("decision_in_flight").commit());
    }
    @Override protected void onDestroy() { stopScanner(); worker.shutdown(); super.onDestroy(); }
}
