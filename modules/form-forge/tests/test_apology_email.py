from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from review_portal import apology_email as apology


class ApologyEmailTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.queue_path = Path(self.tmp.name) / "apology-email-queue.json"
        self.queue_path.write_text(
            json.dumps({"pending": ["arizona-marana"], "sent": {}}) + "\n",
            encoding="utf-8",
        )
        self._orig_queue = apology.QUEUE_PATH
        apology.QUEUE_PATH = self.queue_path

    def tearDown(self) -> None:
        apology.QUEUE_PATH = self._orig_queue
        self.tmp.cleanup()

    def _city(self) -> dict:
        return {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "contact_email": "records@marana.gov",
            "pdf": {
                "status": "completed",
                "user_filled_path": "forms/user-filled/Arizona/arizona-marana.pdf",
            },
        }

    def test_show_apology_button_when_pending_and_pdf_ready(self) -> None:
        self.assertTrue(apology.show_apology_button(self._city()))

    def test_hide_apology_button_after_sent(self) -> None:
        apology.mark_apology_sent("arizona-marana")
        self.assertFalse(apology.show_apology_button(self._city()))

    def test_apology_body_mentions_corrected_attachment(self) -> None:
        body = apology.apology_body("Marana", "Arizona")
        self.assertIn("corrected form", body.lower())
        self.assertIn("sorry", body.lower())
        self.assertIn("Marana", body)

    @patch("review_portal.apology_email.send_email_with_attachment")
    @patch("review_portal.apology_email.refresh_pdf_dates")
    @patch("review_portal.apology_email.log_submission")
    @patch("review_portal.apology_email.load_registry")
    @patch("review_portal.apology_email.find_city")
    def test_send_apology_logs_submission_and_clears_button(
        self,
        mock_find_city,
        mock_load_registry,
        mock_log_submission,
        _mock_refresh,
        _mock_gmail,
    ) -> None:
        city = self._city()
        mock_find_city.return_value = city
        mock_load_registry.return_value = {"cities": [city]}
        mock_log_submission.return_value = {"logged_at": "2026-07-05T12:00:00+00:00", "action": "submitted"}

        with patch.object(Path, "exists", return_value=True):
            result = apology.send_apology_city_pdf_email("arizona-marana")

        self.assertIn("apology_sent_at", result)
        self.assertFalse(apology.show_apology_button(city))
        mock_log_submission.assert_called_once()


if __name__ == "__main__":
    unittest.main()