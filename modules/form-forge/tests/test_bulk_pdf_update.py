"""Tests for bulk PDF contact info application."""
from __future__ import annotations

import unittest

from review_portal.bulk_pdf_update import _update_layout_elements


class BulkPdfUpdateTests(unittest.TestCase):
    def test_update_layout_elements_replaces_contact_fields(self) -> None:
        elements = [
            {"type": "text", "label": "Name", "text": "Old Name"},
            {"type": "text", "label": "Phone", "text": "111-111-1111"},
            {"type": "text", "label": "Email", "text": "old@example.com"},
            {"type": "text", "label": "Request", "text": "Keep this request text"},
            {"type": "signature", "label": "Signature", "text": "Old Name"},
        ]
        settings = {
            "name": "Jane Investor",
            "phone": "(555) 123-4567",
            "email": "jane@example.com",
            "signature_name": "Jane Investor",
        }
        updated = _update_layout_elements(elements, settings)
        by_label = {el["label"]: el for el in updated}
        self.assertEqual(by_label["Name"]["text"], "Jane Investor")
        self.assertEqual(by_label["Phone"]["text"], "(555) 123-4567")
        self.assertEqual(by_label["Email"]["text"], "jane@example.com")
        self.assertEqual(by_label["Signature"]["text"], "Jane Investor")
        self.assertEqual(by_label["Request"]["text"], "Keep this request text")


if __name__ == "__main__":
    unittest.main()