package com.rooiam.mobile;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;

/** Run only on a dedicated certification installation: this suite clears its vault. */
public class DeviceVaultTest {
    private Context getContext() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    @Test
    public void testProtectedRoundtripSignatureAndTamperDetection() throws Exception {
        DeviceVault vault = new DeviceVault(getContext());
        vault.clear();
        try {
            JSONObject identity = vault.generate("https://auth.example", "test-user");
            vault.save(identity);
            String envelope = getContext().getSharedPreferences("vault", 0).getString("device", "");
            assertFalse(envelope.contains(identity.getString("seed")));
            assertFalse(envelope.contains(identity.getString("device_token")));
            JSONObject restored = new DeviceVault(getContext()).load();
            assertEquals(identity.getString("seed"), restored.getString("seed"));
            byte[] message = "rooiam-device-login/v1\ntest".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] signature = DeviceVault.decode(vault.sign(restored, new String(message, java.nio.charset.StandardCharsets.UTF_8)));
            Ed25519Signer verifier = new Ed25519Signer();
            verifier.init(false, new Ed25519PublicKeyParameters(DeviceVault.decode(restored.getString("device_public_key").substring(8)), 0));
            verifier.update(message, 0, message.length); assertTrue(verifier.verifySignature(signature));
            JSONObject altered = new JSONObject(envelope);
            byte[] encrypted = DeviceVault.decode(altered.getString("data")); encrypted[0] ^= 1;
            altered.put("data", DeviceVault.encode(encrypted));
            getContext().getSharedPreferences("vault", 0).edit().putString("device", altered.toString()).commit();
            try { vault.load(); fail("Modified ciphertext must fail authentication"); } catch (java.security.GeneralSecurityException expected) { }
        } finally { vault.clear(); }
        assertNull(vault.load());
    }
}
