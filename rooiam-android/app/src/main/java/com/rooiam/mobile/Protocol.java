package com.rooiam.mobile;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Pure protocol checks shared by the client and JVM tests. */
public final class Protocol {
    /** Accept only the trusted frontend or the exact API email-verification endpoint. */
    public static String emailLink(String value, String frontend, String api, boolean debug) {
        URI link = URI.create(value.trim());
        if (link.getRawUserInfo() != null || link.getFragment() != null) throw new IllegalArgumentException("Invalid sign-in link.");
        String linkOrigin = origin(link.getScheme() + "://" + link.getRawAuthority(), debug);
        boolean frontendLink = linkOrigin.equals(origin(frontend, debug)) && "/verify".equals(link.getRawPath());
        boolean apiLink = linkOrigin.equals(origin(api, debug)) && "/v1/auth/magic-link/verify".equals(link.getRawPath());
        if ((!frontendLink && !apiLink) || link.getRawQuery() == null) throw new IllegalArgumentException("Use the sign-in link from your trusted server.");
        return link.toASCIIString();
    }
    public static String origin(String value, boolean debug) {
        URI uri = URI.create(value.trim());
        boolean local = debug && "http".equals(uri.getScheme()) &&
            ("127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()) || "10.0.2.2".equals(uri.getHost()));
        if (!("https".equals(uri.getScheme()) || local) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Use an HTTPS server origin without a path or credentials.");
        }
        return uri.getScheme() + "://" + uri.getRawAuthority().toLowerCase(java.util.Locale.ROOT);
    }

    public static String parseQr(String qr, String enrolledOrigin, boolean debug) {
        if (qr.length() > 2048) throw new IllegalArgumentException("QR code is too large.");
        URI uri = URI.create(qr);
        if (!"rooiam".equals(uri.getScheme()) || !"device-login".equals(uri.getRawAuthority()) || !uri.getPath().isEmpty() || uri.getFragment() != null || uri.getRawQuery() == null) throw new IllegalArgumentException("Not a Rooiam sign-in QR.");
        Map<String,String> values = new HashMap<>();
        for (String pair : uri.getRawQuery().split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length != 2) throw new IllegalArgumentException("Invalid QR parameters.");
            String key = decode(parts[0]);
            String value = decode(parts[1]);
            if (!(key.equals("server") || key.equals("public_id")) || values.put(key, value) != null) throw new IllegalArgumentException("Unsupported or duplicate QR parameters.");
        }
        if (values.size() != 2 || !origin(values.get("server"), debug).equals(origin(enrolledOrigin, debug))) throw new IllegalArgumentException("This QR belongs to a different server. No credentials were sent.");
        String id = values.get("public_id");
        if (!UUID.fromString(id).toString().equals(id.toLowerCase(java.util.Locale.ROOT))) throw new IllegalArgumentException("Invalid request ID.");
        return id;
    }
    private static String decode(String value) {
        try { return URLDecoder.decode(value, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException impossible) { throw new IllegalStateException(impossible); }
    }
}
