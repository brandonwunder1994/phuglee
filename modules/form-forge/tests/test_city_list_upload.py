from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from review_portal.city_list_upload import (
    CityListUploadError,
    city_response_list_files,
    detect_file_type,
    enrich_list_file_entry,
    save_city_response_list,
)


class CityListUploadTests(unittest.TestCase):
    def _city(self) -> dict:
        return {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "requests": {"code_violation": {}, "water_shutoff": {}},
        }

    def test_save_city_response_list_stores_file_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lists_root = root / "lists"
            with patch("review_portal.city_list_upload.ROOT", root):
                with patch("review_portal.city_list_upload.LISTS_ROOT", lists_root):
                    city = self._city()
                    entry = save_city_response_list(
                        city,
                        "code_violation",
                        filename="violations-march.csv",
                        data=b"address,violation\n1 Main,trash\n",
                        response_status="yes",
                    )
                    stored = lists_root / "Arizona" / city["id"] / "code_violation"
                    saved_files = list(stored.glob("*.csv"))
            self.assertEqual(entry["filename"], "violations-march.csv")
            self.assertTrue(entry["stored_path"].endswith(".csv"))
            files = city["requests"]["code_violation"]["list_files"]
            self.assertEqual(len(files), 1)
            self.assertEqual(files[0]["response_status"], "yes")
            self.assertEqual(files[0]["file_type"], "csv")
            self.assertEqual(files[0]["file_type_label"], "CSV")
            self.assertEqual(len(saved_files), 1)

    def test_detect_file_type_labels(self) -> None:
        self.assertEqual(detect_file_type("report.xlsx"), ("excel", "Excel"))
        self.assertEqual(detect_file_type("scan.PDF"), ("pdf", "PDF"))
        self.assertEqual(detect_file_type("photo.jpeg"), ("jpg", "JPG"))
        self.assertEqual(detect_file_type("letter.docx"), ("word", "Word Doc"))

    def test_enrich_list_file_entry_backfills_missing_type(self) -> None:
        enriched = enrich_list_file_entry({"filename": "violations.xls"})
        self.assertEqual(enriched["file_type"], "excel")
        self.assertEqual(enriched["file_type_label"], "Excel")

    def test_city_response_list_files_includes_download_url(self) -> None:
        city = self._city()
        city["requests"]["code_violation"]["list_files"] = [
            {
                "id": "abc",
                "filename": "list.csv",
                "stored_path": "data/city-response-lists/Arizona/arizona-marana/code_violation/list.csv",
                "uploaded_at": "2026-06-10T12:00:00+00:00",
                "request_type": "code_violation",
                "response_status": "yes",
                "size_bytes": 12,
            }
        ]
        rows = city_response_list_files(city)
        self.assertEqual(len(rows), 1)
        self.assertIn("/api/file/", rows[0]["download_url"])
        self.assertEqual(rows[0]["file_type_label"], "CSV")

    def test_rejects_unsupported_extension(self) -> None:
        city = self._city()
        with self.assertRaises(CityListUploadError):
            save_city_response_list(
                city,
                "code_violation",
                filename="list.exe",
                data=b"bad",
            )


if __name__ == "__main__":
    unittest.main()