from __future__ import annotations

import unittest

from review_portal.api_errors import (
    GENERIC_CLIENT_ERROR,
    GENERIC_SERVER_ERROR,
    error_message,
    is_user_safe_error,
    json_error,
)
from review_portal.apology_email import ApologyEmailError
from review_portal.gmail_client import GmailClientError


class ApiErrorsTests(unittest.TestCase):
    def test_user_safe_value_error(self) -> None:
        exc = ValueError("Contact email on file is not a valid address")
        self.assertTrue(is_user_safe_error(exc))
        self.assertEqual(error_message(exc, status=400), exc.args[0])

    def test_internal_error_is_sanitized(self) -> None:
        exc = RuntimeError("psycopg2 connection refused at 10.0.0.5")
        self.assertFalse(is_user_safe_error(exc))
        self.assertEqual(error_message(exc, status=500), GENERIC_SERVER_ERROR)
        self.assertEqual(error_message(exc, status=400), GENERIC_CLIENT_ERROR)

    def test_gmail_error_is_user_safe(self) -> None:
        exc = GmailClientError("Gmail credentials are invalid. Re-run AUTH-HERE.bat.")
        self.assertTrue(is_user_safe_error(exc))
        self.assertIn("Gmail", error_message(exc, status=400))

    def test_apology_error_is_user_safe(self) -> None:
        exc = ApologyEmailError("Apology email is not available for this city")
        self.assertTrue(is_user_safe_error(exc))

    def test_json_error_payload(self) -> None:
        from review_portal.app import app

        with app.app_context():
            body, status = json_error(RuntimeError("secret"), status=500, log=False)
        self.assertEqual(status, 500)
        self.assertEqual(body.get_json(), {"error": GENERIC_SERVER_ERROR})

    def test_app_hides_internal_errors(self) -> None:
        from review_portal.app import app

        @app.route("/api/_test-boom", methods=["GET"])
        def _test_boom():  # noqa: ANN202
            raise RuntimeError("database password leaked")

        client = app.test_client()
        res = client.get("/api/_test-boom")
        self.assertEqual(res.status_code, 500)
        payload = res.get_json()
        self.assertEqual(payload["error"], GENERIC_SERVER_ERROR)
        self.assertNotIn("password", payload["error"])


if __name__ == "__main__":
    unittest.main()