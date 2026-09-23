package com.rooiam.sdk;

/** HTTP failure without response bodies or credentials. Mutations are never retried. */
public final class RooiamApiException extends java.io.IOException {
    private final int statusCode;
    RooiamApiException(int statusCode) {
        super("Rooiam request failed (HTTP " + statusCode + ").");
        this.statusCode = statusCode;
    }
    public int getStatusCode() { return statusCode; }
}
