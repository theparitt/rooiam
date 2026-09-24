package com.rooiam.sdk;
import org.junit.Test;
import static org.junit.Assert.*;
public class ProtocolTest {
    @Test public void seededMalformedQrCorpusNeverEscapesValidation() {
        java.util.Random random = new java.util.Random(20260923L);
        String valid = "rooiam://device-login?server=https%3A%2F%2Fauth.example&public_id=12345678-1234-4234-8234-123456789abc";
        for (int n = 0; n < 10000; n++) {
            StringBuilder input = new StringBuilder(n % 2 == 0 ? valid : "");
            for (int m = 0; m < 1 + n % 25; m++) {
                int at = random.nextInt(input.length() + 1);
                input.insert(at, (char) random.nextInt(65536));
            }
            try {
                String parsed = Protocol.parseQr(input.toString(), "https://auth.example", false);
                assertEquals(java.util.UUID.fromString(parsed).toString(), parsed.toLowerCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException expected) { }
        }
    }
    private final String id = "12345678-1234-4234-8234-123456789abc";
    @Test public void emailLinksAcceptOnlyTrustedVerificationEndpoints() {
        String frontend = "https://app.example", api = "https://api.example";
        for (String url : new String[]{frontend + "/verify?token=test", api + "/v1/auth/magic-link/verify?token=test"})
            assertEquals(url, Protocol.emailLink(url, frontend, api, false));
        for (String url : new String[]{"https://evil.example/verify?token=test", "https://app.example@evil.example/verify?token=test", api + "/other?token=test", frontend + "/verify", frontend + "/verify?token=test#fragment", "http://app.example/verify?token=test"}) {
            try { Protocol.emailLink(url, frontend, api, false); fail(url); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void validQr() { assertEquals(id, Protocol.parseQr("rooiam://device-login?server=https%3A%2F%2Fauth.example&public_id=" + id, "https://auth.example", false)); }
    @Test public void actionAndLoginQrCannotSubstituteForEachOther() {
        String action = "rooiam://action-approval?server=https%3A%2F%2Fauth.example&id=" + id + "&v=1";
        String login = "rooiam://device-login?server=https%3A%2F%2Fauth.example&public_id=" + id;
        assertEquals(id, Protocol.parseActionQr(action, "https://auth.example", false));
        try { Protocol.parseQr(action, "https://auth.example", false); fail(); } catch (IllegalArgumentException expected) {}
        try { Protocol.parseActionQr(login, "https://auth.example", false); fail(); } catch (IllegalArgumentException expected) {}
        for (String invalid : new String[] {
            "rooiam://action-approval?server=https://evil.example&id=" + id,
            action + "&id=" + id,
            action + "&access_token=secret",
            action.replace("v=1", "v=2"),
            "rooiam://action-approval?server=http://auth.example&id=" + id,
        }) { try { Protocol.parseActionQr(invalid, "https://auth.example", false); fail(invalid); } catch (IllegalArgumentException expected) {} }
    }
    @Test public void rejectsSubstitutionAndAmbiguousInput() {
        for (String qr : new String[] {
            "rooiam://device-login?server=https://evil.example&public_id=" + id,
            "rooiam://device-login?server=https://auth.example&server=https://evil.example&public_id=" + id,
            "rooiam://device-login?server=http://auth.example&public_id=" + id,
            "rooiam://device-login?server=https://auth.example&public_id=" + id + "&access_token=secret",
            "https://auth.example/" + id,
            "rooiam://device-login?server=https://auth.example&public_id=1-1-1-1-1"
        }) { try { Protocol.parseQr(qr, "https://auth.example", false); fail(qr); } catch (IllegalArgumentException expected) {} }
    }
    @Test public void productionRejectsCleartext() { try { Protocol.origin("http://127.0.0.1:5170", false); fail(); } catch (IllegalArgumentException expected) {} }
    @Test public void debugAllowsOnlyLoopbackCleartext() { assertEquals("http://127.0.0.1:5170", Protocol.origin("http://127.0.0.1:5170", true)); }
}
