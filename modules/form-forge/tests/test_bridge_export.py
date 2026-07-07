from __future__ import annotations

import unittest

from review_portal.bridge_export import rows_to_csv_bytes, rows_to_xlsx_bytes


class BridgeExportTests(unittest.TestCase):
    def _row(self) -> dict:
        return {
            "streetAddress": "123 Main St",
            "city": "Marana",
            "state": "Arizona",
            "zip": "85704",
            "violationIssueType": "Overgrown weeds",
            "violationDate": "2026-04-02",
            "descriptionNotes": "Front yard",
            "distressedSignalTag": "Strong Distressed Signal",
            "matchedIndicators": "overgrown",
            "confidenceLevel": "high",
            "sourceFile": "violations.csv",
            "uploadType": "code_violation",
            "processedAt": "2026-07-06T12:00:00.000Z",
        }

    def test_rows_to_csv_bytes(self) -> None:
        data = rows_to_csv_bytes([self._row()])
        text = data.decode("utf-8")
        self.assertIn("Street Address", text)
        self.assertIn("123 Main St", text)

    def test_rows_to_xlsx_bytes(self) -> None:
        data = rows_to_xlsx_bytes([self._row()])
        self.assertTrue(len(data) > 100)


if __name__ == "__main__":
    unittest.main()