package com.rooiam.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ProtocolTest {
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
