package com.rooiam.sdk;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;

/** Ed25519 seed and device token are encrypted with a non-exportable Android Keystore AES key.
 * Signing takes place in app memory; this is NOT a claim of hardware-backed Ed25519 signing.
 */
final class DeviceVault {
    private static final String ALIAS = "rooiam.device.v1";
    private final Context context;
    public DeviceVault(Context context) { this.context = context.getApplicationContext(); }
    public static String encode(byte[] b) { return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
    public static byte[] decode(String s) { return Base64.decode(s, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
    private SecretKey wrappingKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    public JSONObject load() throws Exception {
        String saved = context.getSharedPreferences("vault", 0).getString("device", null);
        if (saved == null) return null;
        JSONObject envelope = new JSONObject(saved);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, wrappingKey(), new GCMParameterSpec(128, decode(envelope.getString("iv"))));
        return new JSONObject(new String(cipher.doFinal(decode(envelope.getString("data"))), java.nio.charset.StandardCharsets.UTF_8));
    }
    public void save(JSONObject device) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, wrappingKey());
        JSONObject envelope = new JSONObject().put("iv", encode(cipher.getIV())).put("data", encode(cipher.doFinal(device.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8))));
        if (!context.getSharedPreferences("vault", 0).edit().putString("device", envelope.toString()).commit()) throw new IllegalStateException("Could not persist the device identity.");
    }
    public JSONObject generate(String origin, String userId) throws Exception {
        byte[] seed = new byte[32], token = new byte[32]; SecureRandom random = new SecureRandom(); random.nextBytes(seed); random.nextBytes(token);
        return new JSONObject().put("origin", origin).put("user_id", userId).put("seed", encode(seed)).put("device_token", encode(token))
            .put("device_public_key", "ed25519:" + encode(new Ed25519PrivateKeyParameters(seed, 0).generatePublicKey().getEncoded()));
    }
    public String sign(JSONObject device, String payload) throws Exception {
        Ed25519Signer signer = new Ed25519Signer(); byte[] seed = decode(device.getString("seed"));
        try {
            signer.init(true, new Ed25519PrivateKeyParameters(seed, 0)); byte[] message = payload.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            signer.update(message, 0, message.length); return encode(signer.generateSignature());
        } finally { java.util.Arrays.fill(seed, (byte) 0); }
    }
    public void clear() throws Exception {
        if (!context.getSharedPreferences("vault", 0).edit().clear().commit()) throw new IllegalStateException("Could not remove device identity.");
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(ALIAS);
    }
}
