"""Flask test_client integration tests for core API contracts."""
from __future__ import annotations

import unittest

from review_portal.app import app


class ApiIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()

    def test_health_endpoint(self) -> None:
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("service"), "form-forge")

    def test_portal_cities_summary_matches_full_count(self) -> None:
        full = self.client.get("/api/portal/cities").get_json()
        summary = self.client.get("/api/portal/cities/summary").get_json()
        self.assertEqual(summary.get("total"), full.get("total"))
        self.assertEqual(len(summary.get("items", [])), len(full.get("items", [])))

    def test_summary_payload_smaller_than_full(self) -> None:
        full_bytes = len(self.client.get("/api/portal/cities").get_data())
        summary_bytes = len(self.client.get("/api/portal/cities/summary").get_data())
        self.assertLess(summary_bytes, full_bytes)
        self.assertLess(summary_bytes / full_bytes, 0.5)

    def test_pending_pdf_blocked_apology_city_consistent(self) -> None:
        """Apology-pending cities with no email must be blocked, not pending."""
        queue = self.client.get("/api/portal/pending-pdf-requests").get_json()
        pending_ids = {item["id"] for item in queue.get("items", [])}
        blocked = {item["id"]: item for item in queue.get("blocked", [])}
        for item in queue.get("items", []):
            if item.get("apology_email", {}).get("show_button"):
                self.assertIn("contact_email", item)
        if "ohio-sidney" in blocked:
            self.assertNotIn("ohio-sidney", pending_ids)
            self.assertTrue(blocked["ohio-sidney"].get("apology_blocked"))

    def test_city_detail_includes_apology_and_tracking(self) -> None:
        res = self.client.get("/api/portal/city/arizona-avondale")
        self.assertEqual(res.status_code, 200)
        city = res.get_json()
        self.assertIn("apology_email", city)
        self.assertIn("tracking", city)
        self.assertIn("show_button", city["apology_email"])

    def test_file_api_blocks_traversal(self) -> None:
        res = self.client.get("/api/file/../../Windows/System32/drivers/etc/hosts")
        self.assertIn(res.status_code, (403, 404))

    def test_unknown_route_returns_json_error(self) -> None:
        res = self.client.get("/api/does-not-exist-route")
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertIn("error", data)

    def test_data_integrity_endpoint(self) -> None:
        res = self.client.get("/api/data/integrity")
        self.assertEqual(res.status_code, 200)
        report = res.get_json()
        self.assertIn("ok", report)
        self.assertIn("pdf_count", report)

    def test_bulk_apply_requires_contact_fields(self) -> None:
        res = self.client.post("/api/settings/bulk-apply", json={"name": "Test"})
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertIn("error", data)

    def test_kpi_endpoint_shape(self) -> None:
        res = self.client.get("/api/portal/kpi")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        for key in (
            "current_month",
            "current_month_label",
            "current_month_email_sent",
            "months",
            "workflows",
            "attention",
            "responses",
        ):
            self.assertIn(key, data)
        responses = data["responses"]
        self.assertIn("summary", responses)
        self.assertIn("feed", responses)
        self.assertIn("code_violation", responses["summary"])
        self.assertIn("water_shutoff", responses["summary"])
        self.assertIsInstance(data["workflows"], list)
        if data["workflows"]:
            wf = data["workflows"][0]
            for field in ("key", "label", "href", "sent", "pending", "total", "pct", "status"):
                self.assertIn(field, wf)

    def test_forms_endpoint_returns_items(self) -> None:
        res = self.client.get("/api/forms")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("items", data)
        self.assertIn("stats", data)


if __name__ == "__main__":
    unittest.main()