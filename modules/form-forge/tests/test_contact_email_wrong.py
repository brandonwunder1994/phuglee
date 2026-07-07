from __future__ import annotations

import unittest
from unittest.mock import patch

from review_portal.apology_email import show_apology_button
from review_portal.email_workflow import EmailWorkflowError, send_city_pdf_email
from review_portal.portal_registry import (
    clear_contact_email_wrong,
    contact_email_invalid,
    contact_email_marked_wrong,
    set_contact_email_wrong,
    update_city_contact_email,
)
from review_portal.request_status import compute_email_status
from review_portal.submission_tracker import portal_city_summary_payload


def _city(**overrides) -> dict:
    base = {
        "id": "arizona-marana",
        "city": "Marana",
        "state": "Arizona",
        "pathway": "email_pdf",
        "contact_email": "records@marana.gov",
        "portal_url": "",
        "pdf": {
            "status": "completed",
            "user_filled_path": "data/forms/Arizona/marana-filled.pdf",
        },
        "requests": {"code_violation": {}},
        "submissions": [],
    }
    base.update(overrides)
    return base


class ContactEmailWrongTests(unittest.TestCase):
    def test_mark_and_clear_wrong_email(self) -> None:
        city = _city()
        set_contact_email_wrong(city, wrong=True)
        self.assertTrue(contact_email_marked_wrong(city))
        self.assertTrue(city.get("contact_email_wrong_at"))
        clear_contact_email_wrong(city)
        self.assertFalse(contact_email_marked_wrong(city))

    def test_update_contact_email_clears_wrong_flag(self) -> None:
        city = _city(contact_email_wrong=True)
        update_city_contact_email(city, "newcontact@marana.gov")
        self.assertEqual(city["contact_email"], "newcontact@marana.gov")
        self.assertFalse(contact_email_marked_wrong(city))

    def test_compute_email_status_blocks_wrong_email(self) -> None:
        status = compute_email_status(_city(contact_email_wrong=True))
        self.assertFalse(status["can_send"])
        self.assertEqual(status["state"], "wrong_email")
        self.assertIn("marked wrong", status["blocked_reason"].lower())

    def test_summary_payload_includes_wrong_flag(self) -> None:
        summary = portal_city_summary_payload(_city(contact_email_wrong=True))
        self.assertTrue(summary["contact_email_wrong"])

    def test_apology_button_hidden_when_wrong_email(self) -> None:
        city = _city(contact_email_wrong=True)
        with patch("review_portal.apology_email.load_apology_queue") as load_queue:
            load_queue.return_value = {"pending": ["arizona-marana"], "sent": {}}
            self.assertFalse(show_apology_button(city, queue=load_queue.return_value))

    def test_send_city_pdf_email_hard_stops_on_wrong_email(self) -> None:
        registry = {"cities": [_city(contact_email_wrong=True)]}
        with patch("review_portal.email_workflow.load_registry", return_value=registry):
            with self.assertRaises(EmailWorkflowError) as ctx:
                send_city_pdf_email("arizona-marana")
        self.assertIn("marked wrong", str(ctx.exception).lower())

    def test_contact_email_invalid_detects_nan(self) -> None:
        city = _city(contact_email="nan")
        self.assertTrue(contact_email_invalid(city))

    def test_compute_email_status_blocks_invalid_email(self) -> None:
        status = compute_email_status(_city(contact_email="nan"))
        self.assertFalse(status["can_send"])
        self.assertEqual(status["state"], "invalid_email")
        self.assertIn("not a valid address", status["blocked_reason"].lower())

    def test_summary_payload_includes_invalid_flag(self) -> None:
        summary = portal_city_summary_payload(_city(contact_email="not-an-email"))
        self.assertTrue(summary["contact_email_invalid"])

    def test_send_city_pdf_email_hard_stops_on_invalid_email(self) -> None:
        registry = {"cities": [_city(contact_email="nan")]}
        with patch("review_portal.email_workflow.load_registry", return_value=registry):
            with self.assertRaises(EmailWorkflowError) as ctx:
                send_city_pdf_email("arizona-marana")
        self.assertIn("not a valid address", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()