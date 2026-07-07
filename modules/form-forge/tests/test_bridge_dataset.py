from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from review_portal.bridge_dataset import (
    BridgeDatasetError,
    city_bridge_datasets,
    save_bridge_dataset,
)


class BridgeDatasetTests(unittest.TestCase):
    def _city(self) -> dict:
        return {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "requests": {"code_violation": {}},
        }

    def test_save_bridge_dataset_stores_files_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            datasets_root = root / "bridge-datasets"
            with patch("review_portal.bridge_dataset.ROOT", root):
                with patch("review_portal.bridge_dataset.DATASETS_ROOT", datasets_root):
                    city = self._city()
                    stats = {"kept": 2, "discarded": 1, "deduplicated": 0}
                    entry = save_bridge_dataset(
                        city,
                        upload_type="code_violation",
                        original_filename="violations-march.xlsx",
                        stats=stats,
                        csv_bytes=b"Street Address,City\n123 Main,Marana\n",
                        xlsx_bytes=b"fake-xlsx",
                        metadata={"parser": "spreadsheet"},
                    )

            self.assertEqual(entry["upload_type"], "code_violation")
            self.assertEqual(entry["kept_count"], 2)
            self.assertTrue(entry["csv_path"].endswith(".csv"))
            self.assertTrue(entry["xlsx_path"].endswith(".xlsx"))
            self.assertTrue(entry["meta_path"].endswith(".json"))
            datasets = city.get("bridge_datasets") or []
            self.assertEqual(len(datasets), 1)
            self.assertEqual(datasets[0]["original_filename"], "violations-march.xlsx")

            meta = json.loads((root / entry["meta_path"]).read_text(encoding="utf-8"))
            self.assertEqual(meta["metadata"]["parser"], "spreadsheet")

    def test_city_bridge_datasets_includes_download_urls(self) -> None:
        city = self._city()
        city["bridge_datasets"] = [
            {
                "id": "v1",
                "upload_type": "water_shut_off",
                "original_filename": "shutoffs.csv",
                "attached_at": "2026-07-06T12:00:00+00:00",
                "kept_count": 5,
                "csv_path": "data/bridge-datasets/Arizona/arizona-marana/shutoffs.csv",
                "xlsx_path": "",
                "meta_path": "data/bridge-datasets/Arizona/arizona-marana/meta.json",
            }
        ]
        rows = city_bridge_datasets(city)
        self.assertEqual(len(rows), 1)
        self.assertIn("/api/file/", rows[0]["csv_download_url"])
        self.assertEqual(rows[0]["xlsx_download_url"], "")

    def test_rejects_invalid_upload_type(self) -> None:
        with self.assertRaises(BridgeDatasetError):
            save_bridge_dataset(
                self._city(),
                upload_type="probate",
                original_filename="x.csv",
                stats={},
                csv_bytes=b"a,b\n1,2\n",
            )


if __name__ == "__main__":
    unittest.main()