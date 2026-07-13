"""Tests for CONTACT-EMAIL-AUDIT email_only import."""
from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from review_portal.email_only import is_email_only_city
from review_portal.portal_registry import find_city, load_registry

ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / "data" / "CONTACT-EMAIL-AUDIT.xlsx"


@unittest.skipUnless(AUDIT_PATH.exists(), "CONTACT-EMAIL-AUDIT.xlsx missing")
class EmailOnlyAuditSyncTests(unittest.TestCase):
    def test_audit_sheet_has_nineteen_email_only_rows(self) -> None:
        df = pd.read_excel(AUDIT_PATH)
        rows = df[df["Pathway"].fillna("").astype(str).str.lower() == "email_only"]
        self.assertEqual(len(rows), 19)

    def test_registry_contains_audit_email_only_cities(self) -> None:
        registry = load_registry()
        df = pd.read_excel(AUDIT_PATH)
        rows = df[df["Pathway"].fillna("").astype(str).str.lower() == "email_only"]
        missing = []
        not_email_only = []
        for _, row in rows.iterrows():
            city = find_city(registry, f"{row['State']}-{row['City']}".lower().replace(" ", "-").replace(".", ""))
            # slugify is more reliable — import from portal_registry
            from review_portal.portal_registry import slugify, normalize_state

            city_id = slugify(normalize_state(row["State"]), str(row["City"]))
            reg = find_city(registry, city_id)
            if not reg:
                missing.append(city_id)
                continue
            if not is_email_only_city(reg):
                not_email_only.append(city_id)
        self.assertEqual(missing, [], f"missing audit cities: {missing}")
        self.assertEqual(not_email_only, [], f"not email_only after import: {not_email_only}")

    @patch("review_portal.submission_tracker.load_registry")
    def test_pending_queue_includes_audit_cities(self, mock_load_registry) -> None:
        from review_portal.submission_tracker import (
            build_pending_email_only_request_queue,
            emailed_email_only_this_month,
            emailed_this_month,
        )

        registry = load_registry()
        mock_load_registry.return_value = registry
        queue = build_pending_email_only_request_queue()
        ids = {item["id"] for item in queue["items"]}

        # Audit cities must remain email_only; pending excludes those emailed this month.
        # texas-cedar-park / ohio-akron were bulk-sent 2026-07-06 — absent from pending while
        # that calendar month is current is correct (already_sent), not a registry regression.
        for city_id in ("texas-cedar-park", "ohio-akron"):
            from review_portal.portal_registry import find_city

            reg = find_city(registry, city_id)
            self.assertIsNotNone(reg, f"missing registry city {city_id}")
            self.assertTrue(is_email_only_city(reg), f"{city_id} should be email_only")
            if city_id not in ids:
                self.assertTrue(
                    emailed_email_only_this_month(reg) or emailed_this_month(reg),
                    f"{city_id} missing from pending but not emailed this month",
                )

        self.assertGreaterEqual(
            queue["total_pending"] + queue["total_sent_this_month"] + queue.get("total_blocked_on_hold", 0),
            19,
            "audit email_only cities should remain eligible (pending, sent, or blocked-on-hold)",
        )


if __name__ == "__main__":
    unittest.main()