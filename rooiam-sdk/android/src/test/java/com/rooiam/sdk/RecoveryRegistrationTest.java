package com.rooiam.sdk;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.*;

public class RecoveryRegistrationTest {
    private static JSONObject local() throws Exception {
        return new JSONObject().put("id", "phone-1").put("device_public_key", "ed25519:key-1");
    }

    @Test public void acceptsOnlyMatchingServerRegistrationForRecovery() throws Exception {
        JSONArray devices = new JSONArray()
            .put(new JSONObject().put("id", "phone-2").put("device_public_key", "ed25519:key-2"))
            .put(new JSONObject().put("id", "phone-1").put("device_public_key", "ed25519:key-1").put("revoked_at", "2026-09-24T00:00:00Z"));
        JSONObject registered = RooiamClient.findStoredRegistration(devices, local());
        assertNotNull(registered);
        assertFalse(registered.isNull("revoked_at"));
        assertNull(RooiamClient.findStoredRegistration(new JSONArray(), local()));
        JSONArray wrongKey = new JSONArray().put(new JSONObject().put("id", "phone-1").put("device_public_key", "ed25519:other").put("revoked_at", "2026-09-24T00:00:00Z"));
        assertThrows(IllegalStateException.class, () -> RooiamClient.findStoredRegistration(wrongKey, local()));
    }
}
