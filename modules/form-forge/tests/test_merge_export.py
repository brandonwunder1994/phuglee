from __future__ import annotations

import unittest

from review_portal.portal_registry import (
    build_pdf_city_record,
    export_registry_to_rows,
    merge_pdf_item_into_city,
    merge_pdf_queue_into_registry,
)


class MergeExportTests(unittest.TestCase):
    def test_build_pdf_city_record(self) -> None:
        item = {
            "id": "arizona-apache-junction",
            "city": "Apache Junction",
            "state": "Arizona",
            "email": "test@example.com",
            "status": "completed",
            "raw_path": "forms/raw/Arizona/arizona-apache-junction.pdf",
            "user_filled_path": "forms/user-filled/Arizona/arizona-apache-junction.pdf",
            "url": "https://example.com/form",
        }
        record = build_pdf_city_record(item)
        self.assertEqual(record["pathway"], "email_pdf")
        self.assertEqual(record["pdf"]["status"], "completed")

    def test_merge_pdf_into_existing_portal_becomes_hybrid(self) -> None:
        existing = {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "pathway": "online",
            "portal_url": "https://portal.example",
            "contact_email": "",
            "requests": {},
            "submissions": [{"event_id": "keep-me"}],
        }
        item = {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "email": "records@marana.gov",
            "status": "completed",
        }
        merged = merge_pdf_item_into_city(existing, item)
        self.assertEqual(merged["pathway"], "hybrid")
        self.assertEqual(merged["submissions"][0]["event_id"], "keep-me")
        self.assertEqual(merged["pdf"]["status"], "completed")

    def test_merge_pdf_queue_into_registry(self) -> None:
        registry = {
            "cities": [
                {
                    "id": "arizona-marana",
                    "city": "Marana",
                    "state": "Arizona",
                    "pathway": "online",
                    "portal_url": "https://portal.example",
                    "contact_email": "",
                    "requests": {},
                    "submissions": [],
                }
            ]
        }
        queue = {
            "items": [
                {
                    "id": "arizona-apache-junction",
                    "city": "Apache Junction",
                    "state": "Arizona",
                    "email": "pdf@example.com",
                    "status": "completed",
                }
            ]
        }
        merged = merge_pdf_queue_into_registry(registry, queue)
        self.assertEqual(merged["city_count"], 2)
        self.assertEqual(merged["cities"][0]["id"], "arizona-apache-junction")

    def test_export_registry_to_rows(self) -> None:
        registry = {
            "cities": [
                {
                    "id": "arizona-marana",
                    "city": "Marana",
                    "state": "Arizona",
                    "pathway": "online",
                    "portal_url": "https://marana.example",
                    "contact_email": "",
                    "form_type": "Online",
                    "requests": {
                        "water_shutoff": {"requested": True, "response_status": "yes", "response_raw": "YES"},
                        "code_violation": {
                            "requested": True,
                            "response_status": "approved_bad_data",
                            "response_raw": "Approved (Bad Data)",
                        },
                    },
                    "submissions": [{"action": "submitted", "logged_at": "2026-07-05T00:00:00+00:00", "channel": "online_portal"}],
                }
            ]
        }
        rows = export_registry_to_rows(registry)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["City"], "Marana")
        self.assertEqual(rows[0]["Water Shut Off Requested?"], "Yes")
        self.assertEqual(rows[0]["Submission Count"], 1)


if __name__ == "__main__":
    unittest.main()