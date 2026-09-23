package com.rooiam.sdk;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.FixMethodOrder;
import org.junit.runners.MethodSorters;
import static org.junit.Assert.*;

/** Dedicated SDK test package only. For process-death evidence, run each method
 * in a separate `am instrument` invocation; the runner exits between invocations. */
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class ProcessPersistenceTest {
    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }

    @Test public void test01Persist() throws Exception {
        DeviceVault vault = new DeviceVault(context());
        vault.clear();
        JSONObject device = vault.generate("https://auth.example", "process-test");
        vault.save(device);
        // Public comparison material only; never store the seed outside the vault.
        assertTrue(context().getSharedPreferences("process-test", 0).edit()
            .putString("public_key", device.getString("device_public_key")).commit());
    }

    @Test public void test02RestoreAndSign() throws Exception {
        DeviceVault vault = new DeviceVault(context());
        try {
            JSONObject restored = vault.load();
            assertNotNull(restored);
            String publicKey = context().getSharedPreferences("process-test", 0).getString("public_key", null);
            assertNotNull(publicKey);
            assertEquals(publicKey, restored.getString("device_public_key"));
            byte[] message = "process-recovery-probe".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            org.bouncycastle.crypto.signers.Ed25519Signer verifier = new org.bouncycastle.crypto.signers.Ed25519Signer();
            verifier.init(false, new org.bouncycastle.crypto.params.Ed25519PublicKeyParameters(DeviceVault.decode(publicKey.substring(8)), 0));
            verifier.update(message, 0, message.length);
            assertTrue(verifier.verifySignature(DeviceVault.decode(vault.sign(restored, "process-recovery-probe"))));
        } finally {
            vault.clear();
            context().getSharedPreferences("process-test", 0).edit().clear().commit();
        }
    }
}
