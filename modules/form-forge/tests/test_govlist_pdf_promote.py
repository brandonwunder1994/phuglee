"""Unit tests for Government List → PDF filler promote merge."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from review_portal import govlist_pdf_promote as promote


class GovlistPdfPromoteTests(unittest.TestCase):
    def test_merge_adds_missing_only(self) -> None:
        seed_cities = [
            {
                "id": "ohio-sidney",
                "city": "Sidney",
                "state": "Ohio",
                "url": "https://example.com/foia.pdf",
                "contact_email": "clerk@sidneyoh.com",
                "sourceId": "research-city-ohio-sidney-code_violation",
            },
            {
                "id": "ohio-troy",
                "city": "Troy",
                "state": "Ohio",
                "url": "https://example.com/troy.pdf",
                "contact_email": "records@troyohio.gov",
                "sourceId": "research-city-ohio-troy-code_violation",
            },
        ]
        registry = {
            "cities": [
                {
                    "id": "ohio-sidney",
                    "city": "Sidney",
                    "state": "Ohio",
                    "pathway": "email_pdf",
                    "pdf": {"status": "completed", "user_filled_path": "forms/user-filled/Ohio/ohio-sidney.pdf"},
                }
            ],
            "city_count": 1,
        }
        next_reg, added = promote.merge_seed_into_registry(registry, seed_cities)
        self.assertEqual(added, 1)
        ids = {c["id"] for c in next_reg["cities"]}
        self.assertEqual(ids, {"ohio-sidney", "ohio-troy"})
        sidney = next(c for c in next_reg["cities"] if c["id"] == "ohio-sidney")
        # Existing completed city must not be replaced
        self.assertEqual(sidney["pdf"]["status"], "completed")

    def test_blocked_states_filtered(self) -> None:
        seed = {
            "cities": [
                {"id": "alabama-new-hope", "city": "New Hope", "state": "Alabama", "url": "https://x.pdf"},
                {"id": "ohio-sidney", "city": "Sidney", "state": "Ohio", "url": "https://y.pdf"},
            ]
        }
        eligible = promote._eligible_seed_cities(seed)
        self.assertEqual([c["id"] for c in eligible], ["ohio-sidney"])

    def test_apply_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            seed_path = root / "seed.json"
            registry_path = root / "portal-registry.json"
            queue_path = root / "review-queue.json"
            marker_path = root / "marker.json"

            seed = {
                "version": "test-v1",
                "cities": [
                    {
                        "id": "ohio-sidney",
                        "city": "Sidney",
                        "state": "Ohio",
                        "url": "https://example.com/foia.pdf",
                        "contact_email": "a@b.com",
                        "sourceId": "src-1",
                    }
                ],
            }
            seed_path.write_text(json.dumps(seed), encoding="utf-8")
            registry_path.write_text(
                json.dumps({"version": 1, "cities": [], "city_count": 0}),
                encoding="utf-8",
            )
            queue_path.write_text(
                json.dumps({"mode": "raw_editor", "items": [], "total": 0, "stats": {}}),
                encoding="utf-8",
            )

            with mock.patch.object(promote, "SEED_PATH", seed_path), mock.patch.object(
                promote, "REGISTRY_PATH", registry_path
            ), mock.patch.object(promote, "QUEUE_PATH", queue_path), mock.patch.object(
                promote, "MARKER_PATH", marker_path
            ), mock.patch.object(promote, "load_registry", lambda: json.loads(registry_path.read_text(encoding="utf-8"))), mock.patch.object(
                promote,
                "save_registry",
                lambda data: registry_path.write_text(json.dumps(data), encoding="utf-8"),
            ):
                first = promote.apply_govlist_pdf_promote(seed_path=seed_path, force=True)
                self.assertEqual(first["registry_added"], 1)
                self.assertEqual(first["queue_added"], 1)

                second = promote.apply_govlist_pdf_promote(seed_path=seed_path, force=False)
                self.assertTrue(second.get("skipped") or second.get("registry_added") == 0)
                reg = json.loads(registry_path.read_text(encoding="utf-8"))
                self.assertEqual(len(reg["cities"]), 1)
                self.assertEqual(reg["cities"][0]["pathway"], "email_pdf")


if __name__ == "__main__":
    unittest.main()
