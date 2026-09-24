import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("ROOIAM_PROXY_SHARED_SECRET", "s" * 64)
os.environ.setdefault("ROOIAM_ALLOWED_PACKAGE_NAME", "com.rooiam.reference")

from app import create_app  # noqa: E402


class DecodeProxyTests(unittest.TestCase):
    def setUp(self):
        self.credentials = Mock(valid=True, token="short-lived-google-token")
        self.google = Mock()
        self.google.post.return_value = Mock(
            status_code=200,
            json=lambda: {"tokenPayloadExternal": {"requestDetails": {}}},
        )
        self.client = create_app(self.credentials, self.google).test_client()
        self.path = "/v1/com.rooiam.reference:decodeIntegrityToken"
        self.headers = {"X-Rooiam-Proxy-Secret": "s" * 64}

    def test_rejects_missing_secret_before_contacting_google(self):
        response = self.client.post(self.path, json={"integrityToken": "token"})
        self.assertEqual(response.status_code, 401)
        self.google.post.assert_not_called()

    def test_rejects_different_package_before_contacting_google(self):
        response = self.client.post(
            "/v1/com.other.app:decodeIntegrityToken",
            headers=self.headers,
            json={"integrityToken": "token"},
        )
        self.assertEqual(response.status_code, 403)
        self.google.post.assert_not_called()

    def test_returns_google_payload_only_after_authentication(self):
        response = self.client.post(
            self.path, headers=self.headers, json={"integrityToken": "token"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("tokenPayloadExternal", response.json)
        self.google.post.assert_called_once_with(
            "https://playintegrity.googleapis.com/v1/com.rooiam.reference:decodeIntegrityToken",
            headers={"Authorization": "Bearer short-lived-google-token"},
            json={"integrityToken": "token"},
            timeout=10,
        )

    def test_google_rejection_does_not_expose_upstream_body(self):
        self.google.post.return_value = Mock(status_code=400)
        response = self.client.post(
            self.path, headers=self.headers, json={"integrityToken": "bad"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("bad", response.get_data(as_text=True))

    def test_google_unavailable_fails_closed(self):
        self.google.post.side_effect = __import__("requests").Timeout()
        response = self.client.post(
            self.path, headers=self.headers, json={"integrityToken": "token"}
        )
        self.assertEqual(response.status_code, 503)

    def test_secret_manager_file_newline_does_not_break_authentication(self):
        with patch.dict(os.environ, {"ROOIAM_PROXY_SHARED_SECRET": "s" * 64 + "\n"}):
            client = create_app(self.credentials, self.google).test_client()
        response = client.post(
            self.path, headers=self.headers, json={"integrityToken": "token"}
        )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
