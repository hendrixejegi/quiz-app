import copy
import io
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from fastapi.testclient import TestClient

from app.admin_auth import MAX_SESSION_RESPONSE_BYTES, NoRedirects
from app.main import app


class AdminAuthTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "BETTER_AUTH_URL": "http://localhost:3001/api/auth",
            "ADMIN_USER_IDS": " admin-1, admin-2 ",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.opener_patch = patch("app.admin_auth.build_opener")
        self.opener = self.opener_patch.start()
        self.addCleanup(self.opener_patch.stop)
        self.response = MagicMock()
        self.response.status = 200
        self.opener.return_value.open.return_value.__enter__.return_value = self.response
        self.payload = {
            "user": {"id": "admin-1", "email": "private@example.com"},
            "session": {
                "userId": "admin-1", "token": "do-not-return",
                "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            },
        }
        self.set_payload(self.payload)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def set_payload(self, payload):
        self.response.read.return_value = json.dumps(payload).encode()

    def get_identity(self, token="test-session"):
        return self.client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"})

    def test_verified_allowlisted_admin_receives_only_user_id(self):
        response = self.get_identity()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"id": "admin-1"})
        self.assertEqual(response.headers["cache-control"], "no-store")
        call = self.opener.return_value.open.call_args
        self.assertEqual(call.args[0].full_url, "http://localhost:3001/api/auth/get-session?disableCookieCache=true")
        self.assertEqual(call.args[0].get_header("Authorization"), "Bearer test-session")
        self.assertEqual(call.kwargs["timeout"], 5)
        self.assertIsInstance(self.opener.call_args.args[0], NoRedirects)

    def test_missing_wrong_or_malformed_credentials_are_unauthorized(self):
        for headers in ({}, {"Authorization": "Basic test"}, {"Authorization": "Bearer"},
                        {"Authorization": "Bearer two tokens"}, {"Authorization": "Bearer " + "x" * 4097}):
            with self.subTest(headers_length=len(str(headers))):
                response = self.client.get("/api/admin/me", headers=headers)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.headers["www-authenticate"], "Bearer")
        self.opener.assert_not_called()

    def test_valid_non_admin_is_forbidden_even_with_claimed_admin_role(self):
        self.payload["user"].update(id="ordinary-user", role="admin")
        self.payload["session"]["userId"] = "ordinary-user"
        self.set_payload(self.payload)
        self.assertEqual(self.get_identity().status_code, 403)

    def test_revoked_and_expired_sessions_are_unauthorized(self):
        self.set_payload(None)
        self.assertEqual(self.get_identity().status_code, 401)
        self.payload["session"]["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.set_payload(self.payload)
        self.assertEqual(self.get_identity().status_code, 401)

    def test_every_request_rechecks_session_for_revocation(self):
        self.assertEqual(self.get_identity().status_code, 200)
        self.set_payload(None)
        self.assertEqual(self.get_identity().status_code, 401)
        self.assertEqual(self.opener.return_value.open.call_count, 2)

    def test_invalid_upstream_payloads_fail_closed(self):
        invalid_payloads = [{}, [], {"user": None}, copy.deepcopy(self.payload), copy.deepcopy(self.payload)]
        invalid_payloads[-2]["session"]["userId"] = "different-user"
        invalid_payloads[-1]["session"]["expiresAt"] = "2026-01-01T00:00:00"
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                self.set_payload(payload)
                self.assertEqual(self.get_identity().status_code, 503)
        for body in (b"not-json", b"x" * (MAX_SESSION_RESPONSE_BYTES + 1)):
            self.response.read.return_value = body
            self.assertEqual(self.get_identity().status_code, 503)

    def test_upstream_errors_are_sanitized_and_fail_closed(self):
        for error, expected in ((URLError("secret"), 503), (TimeoutError("secret"), 503),
                                (HTTPError("secret", 401, "secret", {}, io.BytesIO()), 401),
                                (HTTPError("secret", 403, "secret", {}, io.BytesIO()), 401),
                                (HTTPError("secret", 500, "secret", {}, io.BytesIO()), 503),
                                (HTTPError("secret", 302, "secret", {}, io.BytesIO()), 503)):
            with self.subTest(error=error):
                self.opener.return_value.open.side_effect = error
                response = self.get_identity()
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("secret", response.text)

    def test_missing_allowlist_or_unsafe_auth_url_fails_closed_without_network(self):
        with patch.dict(os.environ, {"ADMIN_USER_IDS": ""}):
            self.assertEqual(self.get_identity().status_code, 503)
        for url in ("", "http://auth.example.com/api/auth", "https://user:pass@example.com", "https://auth.example.com?redirect=1"):
            with self.subTest(url=url), patch.dict(os.environ, {"BETTER_AUTH_URL": url}):
                self.assertEqual(self.get_identity().status_code, 503)
        self.opener.assert_not_called()

    def test_redirect_handler_refuses_to_forward_credentials(self):
        self.assertIsNone(NoRedirects().redirect_request(None, None, 302, "", {}, "https://elsewhere.example"))

    def test_health_remains_public(self):
        self.assertEqual(self.client.get("/api/health").status_code, 200)
        self.opener.assert_not_called()


if __name__ == "__main__":
    unittest.main()
