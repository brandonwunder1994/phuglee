from __future__ import annotations

import unittest
from unittest.mock import patch

from review_portal.apology_email import show_apology_button
from review_portal.portal_registry import (
    EXCEL_COLUMNS,
    build_city_record,
    build_pdf_city_record,
    city_has_completed_pdf,
    extract_url_and_email,
    include_in_city_tracker,
    is_pdf_link_url,
    is_valid_contact_email,
    merge_duplicate_records,
    normalize_contact_email,
    normalize_cv_response,
    normalize_state,
    normalize_water_response,
    parse_yes_no,
    slugify,
)


class PortalRegistryTests(unittest.TestCase):
    def test_normalize_state_co(self) -> None:
        self.assertEqual(normalize_state("CO"), "Colorado")

    def test_parse_yes_no(self) -> None:
        self.assertTrue(parse_yes_no("Yes"))
        self.assertFalse(parse_yes_no("No"))
        self.assertIsNone(parse_yes_no(None))

    def test_extract_url_from_free_text(self) -> None:
        raw = (
            "Told me I need to use their interactive violations map: "
            "https://data.tempe.gov/datasets/64aa3d0410994060b8ab3ebbe67ddb80_0/explore"
        )
        portal_url, email, notes = extract_url_and_email(raw)
        self.assertTrue(portal_url.startswith("https://data.tempe.gov"))
        self.assertEqual(email, "")
        self.assertIn("interactive violations map", notes)

    def test_extract_email_url(self) -> None:
        portal_url, email, notes = extract_url_and_email("policerecords@tolleson.az.gov")
        self.assertEqual(email, "policerecords@tolleson.az.gov")
        self.assertEqual(portal_url, "")
        self.assertEqual(notes, "")

    def test_is_pdf_link_url(self) -> None:
        self.assertTrue(is_pdf_link_url("https://example.com/form.pdf"))
        self.assertTrue(is_pdf_link_url("https://example.com/form.PDF?disposition=inline"))
        self.assertFalse(is_pdf_link_url("https://marana.seamlessdocs.com/f/recordsrequest"))
        self.assertFalse(is_pdf_link_url(""))

    def test_water_response_pending(self) -> None:
        status, raw = normalize_water_response(None)
        self.assertEqual(status, "pending")
        self.assertEqual(raw, "")

    def test_cv_response_mapping(self) -> None:
        status, raw = normalize_cv_response("Approved (Bad Data)")
        self.assertEqual(status, "approved_bad_data")
        self.assertEqual(raw, "Approved (Bad Data)")

    def test_slugify(self) -> None:
        self.assertEqual(slugify("Arizona", "Marana"), "arizona-marana")

    def test_normalize_contact_email_rejects_nan_placeholder(self) -> None:
        self.assertEqual(normalize_contact_email("nan"), "")
        self.assertFalse(is_valid_contact_email("nan"))
        self.assertEqual(
            build_pdf_city_record({"id": "ohio-sidney", "city": "Sidney", "state": "Ohio", "email": "nan"})[
                "contact_email"
            ],
            "",
        )

    def test_show_apology_button_hidden_for_nan_email(self) -> None:
        city = {
            "id": "ohio-sidney",
            "contact_email": "nan",
            "pdf": {"status": "completed", "user_filled_path": "forms/user-filled/Ohio/ohio-sidney.pdf"},
        }
        with patch("review_portal.apology_email.load_apology_queue") as load_queue:
            load_queue.return_value = {"pending": ["ohio-sidney"], "sent": {}}
            self.assertFalse(show_apology_button(city, queue=load_queue.return_value))

    def test_merge_duplicates(self) -> None:
        row_a = {
            EXCEL_COLUMNS["city"]: "Georgetown",
            EXCEL_COLUMNS["state"]: "Delaware",
            EXCEL_COLUMNS["water_requested"]: "Yes",
            EXCEL_COLUMNS["water_response"]: None,
            EXCEL_COLUMNS["url"]: "https://example.com/a",
            EXCEL_COLUMNS["cv_requested"]: "Yes",
            EXCEL_COLUMNS["cv_response"]: None,
            EXCEL_COLUMNS["form_type"]: "Online",
        }
        row_b = {
            EXCEL_COLUMNS["city"]: "Georgetown",
            EXCEL_COLUMNS["state"]: "Delaware",
            EXCEL_COLUMNS["water_requested"]: "Yes",
            EXCEL_COLUMNS["water_response"]: "YES",
            EXCEL_COLUMNS["url"]: None,
            EXCEL_COLUMNS["cv_requested"]: "Yes",
            EXCEL_COLUMNS["cv_response"]: "Yes",
            EXCEL_COLUMNS["form_type"]: "Online",
        }
        records = [build_city_record(row_a), build_city_record(row_b)]
        merged, warnings = merge_duplicate_records(records)
        self.assertEqual(len(merged), 1)
        self.assertEqual(len(warnings), 1)
        self.assertEqual(merged[0]["requests"]["water_shutoff"]["response_status"], "yes")
        self.assertEqual(merged[0]["portal_url"], "https://example.com/a")

    def test_include_in_city_tracker_completed_pdf(self) -> None:
        city = {
            "id": "arizona-test",
            "pathway": "email_pdf",
            "pdf": {"status": "completed", "user_filled_path": "forms/user-filled/Arizona/arizona-test.pdf"},
        }
        self.assertTrue(include_in_city_tracker(city))

    def test_exclude_incomplete_pdf_only_city(self) -> None:
        city = {
            "id": "arizona-test",
            "pathway": "email_pdf",
            "pdf": {"status": "missing_pdf"},
        }
        self.assertFalse(include_in_city_tracker(city))

    def test_include_online_portal_city(self) -> None:
        city = {"id": "texas-test", "pathway": "online", "portal_url": "https://example.com"}
        self.assertTrue(include_in_city_tracker(city))

    def test_city_has_completed_pdf_requires_path(self) -> None:
        self.assertFalse(city_has_completed_pdf({"pdf": {"status": "completed"}}))
        self.assertTrue(
            city_has_completed_pdf(
                {"pdf": {"status": "completed", "user_filled_path": "forms/user-filled/x.pdf"}}
            )
        )


if __name__ == "__main__":
    unittest.main()