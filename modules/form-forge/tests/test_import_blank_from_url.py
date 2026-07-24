from __future__ import annotations

import unittest
from unittest.mock import patch

from review_portal.raw_upload import (
    fetch_pdf_bytes,
    import_blank_pdf_from_url,
    looks_like_direct_pdf_url,
)


class ImportBlankFromUrlTests(unittest.TestCase):
    def test_looks_like_direct_pdf_url(self) -> None:
        self.assertTrue(
            looks_like_direct_pdf_url(
                "https://webgen1files1.revize.com/cityofbensonaz/calendar_app/Document%20Center/Department/City%20clerk/Forms%20&%20Applications/Public_recorders_request_original.pdf"
            )
        )
        self.assertTrue(looks_like_direct_pdf_url("https://example.com/forms/request.pdf?v=1"))
        self.assertFalse(looks_like_direct_pdf_url("https://example.com/justfoia/portal"))
        self.assertFalse(looks_like_direct_pdf_url(""))

    def test_fetch_rejects_html(self) -> None:
        class FakeResp:
            headers = {"Content-Type": "text/html"}

            def read(self):
                return b"<!DOCTYPE html><html></html>"

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        with patch("review_portal.raw_upload.urllib.request.urlopen", return_value=FakeResp()):
            with self.assertRaises(ValueError) as ctx:
                fetch_pdf_bytes("https://example.com/form.pdf")
        self.assertIn("not a valid PDF", str(ctx.exception))

    def test_import_blank_from_url_saves(self) -> None:
        item = {"id": "arizona-benson", "city": "Benson", "state": "Arizona", "url": "https://ex.com/a.pdf"}
        fake_pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"

        with patch("review_portal.raw_upload.fetch_pdf_bytes", return_value=fake_pdf):
            with patch(
                "review_portal.raw_upload.save_blank_pdf",
                return_value={
                    "raw_path": "forms/raw/Arizona/arizona-benson.pdf",
                    "preview_path": "",
                    "fillable": False,
                    "field_count": 0,
                    "field_names": [],
                    "uploaded_at": "2026-07-21T00:00:00+00:00",
                },
            ) as save:
                meta = import_blank_pdf_from_url(item)
        save.assert_called_once()
        self.assertEqual(meta["raw_path"], "forms/raw/Arizona/arizona-benson.pdf")
        self.assertEqual(meta["source_url"], "https://ex.com/a.pdf")


if __name__ == "__main__":
    unittest.main()
