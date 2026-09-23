package com.rooiam.sdk;


import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

final class Api {
    private final String origin;
    private final RooiamClient.SessionCookies cookies;
    Api(String origin, boolean local, RooiamClient.SessionCookies cookies) { this.origin = Protocol.origin(origin, local); this.cookies = cookies; }
    public JSONObject request(String path, JSONObject body) throws Exception { return request(path, body == null ? "GET" : "POST", body); }
    public JSONObject request(String path, String method, JSONObject body) throws Exception {
        if (!path.startsWith("/v1/") || path.contains("..") || path.contains("\\")) throw new IllegalArgumentException("Invalid API path.");
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + path).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
            connection.setRequestMethod(method); connection.setRequestProperty("Accept", "application/json");
            String cookie = cookies.getCookie(origin);
            if (cookie != null) connection.setRequestProperty("Cookie", cookie);
            if (body != null) {
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
                try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException("Server redirect refused. Check your server origin.");
            if (status >= 400) throw new RooiamApiException(status);
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = "{}";
            if (stream != null) try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[4096]; int n;
                while ((n = in.read(chunk)) != -1) { if (out.size() + n > 1_048_576) throw new IllegalStateException("Response too large."); out.write(chunk, 0, n); }
                text = out.toString("UTF-8");
            }
            JSONObject result = text.startsWith("[") ? new JSONObject().put("items", new org.json.JSONArray(text)) : new JSONObject(text);
            return result;
        } finally { connection.disconnect(); }
    }
}
