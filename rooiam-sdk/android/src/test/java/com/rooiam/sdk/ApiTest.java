package com.rooiam.sdk;

import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.MockResponse;
import org.junit.Test;
import static org.junit.Assert.*;

public class ApiTest {
    @Test public void refusesRedirectWithoutForwardingCredentials() throws Exception {
        try (MockWebServer target = new MockWebServer(); MockWebServer server = new MockWebServer()) {
            target.start(); server.start();
            server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", target.url("/")));
            Api api = new Api(server.url("/").toString(), true, origin -> "test_session=private");
            assertThrows(IllegalStateException.class, () -> api.request("/v1/redirect", null));
            assertEquals("test_session=private", server.takeRequest().getHeader("Cookie"));
            assertEquals(0, target.getRequestCount());
        }
    }
    @Test public void suppliesTrustedOriginAndExposesStatusWithoutServerBody() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setResponseCode(401).setBody("private-response-data"));
            String origin = Protocol.origin(server.url("/").toString(), true);
            Api api = new Api(origin, true, trusted -> { assertEquals(origin, trusted); return null; });
            RooiamApiException error = assertThrows(RooiamApiException.class, () -> api.request("/v1/fail", new org.json.JSONObject()));
            assertEquals(401, error.getStatusCode()); assertFalse(error.getMessage().contains("private-response-data"));
            assertEquals(1, server.getRequestCount());
            assertThrows(IllegalArgumentException.class, () -> api.request("/v1/../other", null));
            assertEquals(1, server.getRequestCount());
        }
    }
}
