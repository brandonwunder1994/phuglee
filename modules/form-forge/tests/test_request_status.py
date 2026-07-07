from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from review_portal.request_status import (
    COOLDOWN_DAYS,
    compute_email_status,
    compute_online_status,
    compute_turnaround_days,
)


def _city_with_email_sent(logged_at: str, *, response_status: str = "pending", city_replied: bool = False) -> dict:
    return {
        "id": "arizona-carefree",
        "requests": {
            "code_violation": {
                "requested": True,
                "requested_at": logged_at[:10],
                "last_email_sent_at": logged_at,
                "response_status": response_status,
                "city_replied": city_replied,
            }
        },
        "submissions": [
            {
                "action": "submitted",
                "request_type": "code_violation",
                "channel": "email_pdf",
                "logged_at": logged_at,
            }
        ],
    }


class RequestStatusTests(unittest.TestCase):
    def test_email_ready_when_never_sent(self) -> None:
        status = compute_email_status({"requests": {"code_violation": {}}})
        self.assertTrue(status["can_send"])
        self.assertEqual(status["state"], "ready")

    def test_email_blocked_when_marked_wrong(self) -> None:
        status = compute_email_status(
            {
                "contact_email": "bad@city.gov",
                "contact_email_wrong": True,
                "requests": {"code_violation": {}},
            }
        )
        self.assertFalse(status["can_send"])
        self.assertEqual(status["state"], "wrong_email")

    def test_email_locked_until_city_replies(self) -> None:
        sent = datetime.now(timezone.utc).isoformat()
        status = compute_email_status(_city_with_email_sent(sent))
        self.assertFalse(status["can_send"])
        self.assertEqual(status["state"], "sent_waiting")
        self.assertIn("Email Sent", status["sent_label"])

    def test_email_cooldown_after_city_replies(self) -> None:
        sent = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        city = _city_with_email_sent(sent, response_status="yes", city_replied=True)
        status = compute_email_status(city)
        self.assertFalse(status["can_send"])
        self.assertEqual(status["state"], "cooldown")
        self.assertIn("cannot request again until", status["blocked_reason"].lower())

    def test_email_available_after_cooldown_and_reply(self) -> None:
        sent = (datetime.now(timezone.utc) - timedelta(days=COOLDOWN_DAYS + 1)).isoformat()
        city = _city_with_email_sent(sent, response_status="yes", city_replied=True)
        status = compute_email_status(city)
        self.assertTrue(status["can_send"])
        self.assertEqual(status["state"], "ready_after_reply")

    def test_online_cooldown_without_reply_requirement(self) -> None:
        sent = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        city = {
            "requests": {"code_violation": {"last_online_submitted_at": sent}},
            "submissions": [
                {
                    "action": "submitted",
                    "request_type": "code_violation",
                    "channel": "online_portal",
                    "logged_at": sent,
                }
            ],
        }
        status = compute_online_status(city)
        self.assertFalse(status["can_submit"])
        self.assertEqual(status["state"], "cooldown")

    def test_turnaround_days(self) -> None:
        days = compute_turnaround_days("2026-07-01", "2026-07-11")
        self.assertEqual(days, 10)


if __name__ == "__main__":
    unittest.main()