"""Small Cloud Run boundary for Google Play Integrity token decoding.

Rooiam continues to validate the returned verdict and enrollment binding itself.
This service only authenticates to Google with its attached Cloud Run identity.
"""

import hmac
import os
import re

import google.auth
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from flask import Flask, jsonify, request
import requests


SCOPE = "https://www.googleapis.com/auth/playintegrity"
PACKAGE_RE = re.compile(r"[A-Za-z0-9_.]+\Z")


def create_app(credentials=None, google_session=None):
    secret = os.environ.get("ROOIAM_PROXY_SHARED_SECRET", "").strip()
    package = os.environ.get("ROOIAM_ALLOWED_PACKAGE_NAME", "")
    if len(secret) < 32 or not secret.isascii():
        raise RuntimeError("ROOIAM_PROXY_SHARED_SECRET must have at least 32 ASCII characters")
    if not PACKAGE_RE.fullmatch(package):
        raise RuntimeError("ROOIAM_ALLOWED_PACKAGE_NAME must be a single Android package")

    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 131072
    if google_session is None:
        google_session = requests.Session()

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.post("/v1/<requested_package>:decodeIntegrityToken")
    def decode(requested_package):
        nonlocal credentials
        supplied = request.headers.get("X-Rooiam-Proxy-Secret", "")
        if not hmac.compare_digest(supplied, secret):
            return jsonify(error={"message": "Unauthorized"}), 401
        if requested_package != package:
            return jsonify(error={"message": "Package is not allowed"}), 403
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get("integrityToken"), str):
            return jsonify(error={"message": "integrityToken is required"}), 400
        token = body["integrityToken"].strip()
        if not token:
            return jsonify(error={"message": "integrityToken is required"}), 400

        try:
            if credentials is None:
                credentials, _ = google.auth.default(scopes=[SCOPE])
            if not credentials.valid:
                credentials.refresh(Request())
            google_response = google_session.post(
                f"https://playintegrity.googleapis.com/v1/{package}:decodeIntegrityToken",
                headers={"Authorization": f"Bearer {credentials.token}"},
                json={"integrityToken": token},
                timeout=10,
            )
        except (requests.RequestException, GoogleAuthError):
            return jsonify(error={"message": "Google Play Integrity is unavailable"}), 503

        if google_response.status_code == 400:
            return jsonify(error={"message": "Google Play Integrity rejected this token"}), 400
        if google_response.status_code != 200:
            return jsonify(error={"message": "Google Play Integrity is unavailable"}), 503
        try:
            payload = google_response.json()
        except ValueError:
            return jsonify(error={"message": "Google Play Integrity returned invalid JSON"}), 503
        return jsonify(payload)

    return app


app = create_app()
