from __future__ import annotations

import unittest
from unittest.mock import patch

from review_portal.email_only import build_email_only_body, is_email_only_city, is_email_only_workflow_city
from review_portal.submission_tracker import build_pending_email_only_request_queue


class EmailOnlyTests(unittest.TestCase):
    def test_email_only_city_with_contact_no_pdf(self) -> None:
        city = {
            "id": "arizona-tolleson",
            "pathway": "email_only",
            "contact_email": "records@tolleson.az.gov",
            "pdf": {"status": "missing_pdf"},
        }
        self.assertTrue(is_email_only_city(city))

    def test_pdf_email_city_is_not_email_only(self) -> None:
        city = {
            "id": "arizona-florence",
            "pathway": "email_pdf",
            "contact_email": "clerk@florence.gov",
            "pdf": {"status": "missing_pdf"},
        }
        self.assertFalse(is_email_only_city(city))

    def test_completed_pdf_is_not_email_only(self) -> None:
        city = {
            "id": "arizona-marana",
            "pathway": "email_pdf",
            "contact_email": "records@marana.gov",
            "pdf": {"status": "completed", "user_filled_path": "forms/user-filled/Arizona/arizona-marana.pdf"},
        }
        self.assertFalse(is_email_only_city(city))

    def test_pending_email_only_queue(self) -> None:
        registry = {
            "cities": [
                {
                    "id": "test-email-only-alpha",
                    "city": "Alpha",
                    "state": "Arizona",
                    "pathway": "email_only",
                    "contact_email": "records@alpha.test",
                    "pdf": {"status": "missing_pdf"},
                    "requests": {"code_violation": {"response_status": "pending"}},
                    "submissions": [],
                },
                {
                    "id": "test-email-only-beta",
                    "city": "Beta",
                    "state": "Connecticut",
                    "pathway": "email_only",
                    "contact_email": "clerk@beta.test",
                    "pdf": {"status": "missing_pdf"},
                    "requests": {"code_violation": {"response_status": "pending"}},
                    "submissions": [],
                },
            ]
        }
        queue = build_pending_email_only_request_queue(registry)
        self.assertEqual(queue["total_pending"], 2)
        self.assertEqual(queue["total_eligible"], 2)
        ids = {item["id"] for item in queue["items"]}
        self.assertEqual(ids, {"test-email-only-alpha", "test-email-only-beta"})
        self.assertIn("Brandon Joseph Wunder", queue["items"][0]["email_body_preview"])

    def test_needs_contact_not_in_total_eligible(self) -> None:
        registry = {
            "cities": [
                {
                    "id": "test-email-only-gamma",
                    "city": "Gamma",
                    "state": "Arizona",
                    "pathway": "email_only",
                    "contact_email": "records@gamma.test",
                    "pdf": {"status": "missing_pdf"},
                    "requests": {"code_violation": {"response_status": "pending"}},
                    "submissions": [],
                },
                {
                    "id": "test-email-only-no-contact",
                    "city": "No Contact",
                    "state": "Connecticut",
                    "pathway": "online",
                    "contact_email": "",
                    "portal_url": "",
                    "pdf": {"status": "missing_pdf"},
                    "requests": {"code_violation": {"response_status": "pending"}},
                    "submissions": [],
                },
            ]
        }
        queue = build_pending_email_only_request_queue(registry)
        self.assertEqual(queue["total_pending"], 1)
        self.assertEqual(queue["total_needs_contact"], 1)
        self.assertEqual(queue["total_eligible"], 1)

    def test_workflow_includes_no_contact_cities_as_blocked(self) -> None:
        city = {
            "id": "connecticut-milford",
            "city": "Milford",
            "state": "Connecticut",
            "pathway": "online",
            "contact_email": "",
            "portal_url": "",
            "url_notes": "Said to contact the health department",
            "pdf": {"status": "missing_pdf"},
        }
        self.assertTrue(is_email_only_workflow_city(city))
        self.assertFalse(is_email_only_city(city))

    def test_email_only_body_uses_brandon_template(self) -> None:
        body = build_email_only_body("Tolleson", "Arizona")
        self.assertIn("Brandon Joseph Wunder", body)
        self.assertIn("Tolleson, Arizona", body)
        self.assertIn("602-815-8040", body)


if __name__ == "__main__":
    unittest.main()