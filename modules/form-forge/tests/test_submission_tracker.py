from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from unittest.mock import patch

from review_portal.apology_email import show_apology_button
from review_portal.submission_tracker import (
    SubmissionTrackerError,
    build_cv_monthly_tracker,
    build_pending_online_request_queue,
    build_pending_pdf_fill_queue,
    build_pending_pdf_request_queue,
    build_portal_error_queue,
    build_submission_kpi,
    build_turnaround_stats,
    clear_city_portal_error,
    compute_city_average_turnaround,
    city_submission_summary,
    is_pdf_fill_needed,
    log_response,
    log_submission,
    mark_city_portal_error,
    pending_pdf_fill_queue_item,
    pending_pdf_queue_item,
    reclassify_city_as_pdf_form,
    portal_city_payload,
    portal_city_summary_payload,
    portal_city_tracker_summaries,
    read_recent_submissions,
    record_other_contact_response,
    reset_monthly_submissions,
    revert_online_submission_this_month,
)


def _sample_registry() -> dict:
    return {
        "version": 1,
        "city_count": 1,
        "cities": [
            {
                "id": "arizona-marana",
                "city": "Marana",
                "state": "Arizona",
                "pathway": "online",
                "portal_url": "https://marana.seamlessdocs.com/f/recordsrequest",
                "contact_email": "",
                "requests": {
                    "water_shutoff": {
                        "requested": True,
                        "response_status": "pending",
                        "response_raw": "",
                    },
                    "code_violation": {
                        "requested": True,
                        "requested_at": "2026-06-08",
                        "response_status": "pending",
                        "response_raw": "",
                    },
                },
                "submissions": [],
            }
        ],
    }


class SubmissionTrackerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_path = Path(self.temp_dir.name) / "submission-log.jsonl"
        self.registry = _sample_registry()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_log_online_submission(self) -> None:
        event = log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
        )
        self.assertEqual(event["channel"], "online_portal")
        self.assertEqual(event["action"], "submitted")
        self.assertEqual(len(self.registry["cities"][0]["submissions"]), 1)
        recent = read_recent_submissions(log_path=self.log_path)
        self.assertEqual(len(recent), 1)

    def test_log_email_submission(self) -> None:
        event = log_submission(
            "arizona-marana",
            "code_violation",
            "email_pdf",
            email="records@marana.gov",
            pdf_path="forms/user-filled/Arizona/arizona-marana.pdf",
            registry=self.registry,
            log_path=self.log_path,
        )
        self.assertEqual(event["channel"], "email_pdf")
        self.assertEqual(event["email"], "records@marana.gov")
        self.assertIn("arizona-marana.pdf", event["pdf_path"])

    def test_other_contact_response_updates_email_and_notes(self) -> None:
        city = self.registry["cities"][0]
        city["contact_email"] = "old@city.gov"
        city["pdf"] = {
            "status": "completed",
            "user_filled_path": "forms/user-filled/Arizona/arizona-marana.pdf",
        }
        result = record_other_contact_response(
            "arizona-marana",
            "code_violation",
            new_contact_email="newcontact@city.gov",
            notes="Clerk said to email records desk",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
            auto_send_pdf=False,
        )

        self.assertEqual(city["contact_email"], "newcontact@city.gov")
        self.assertFalse(result["email_sent"])

        req = city["requests"]["code_violation"]
        self.assertEqual(req["response_status"], "other_contact")
        submission = city["submissions"][0]
        self.assertEqual(submission["response_status"], "other_contact")
        self.assertIn("newcontact@city.gov", submission["notes"])
        self.assertIn("Clerk said to email records desk", submission["notes"])
        self.assertEqual(submission["new_contact_email"], "newcontact@city.gov")
        self.assertEqual(submission["previous_contact_email"], "old@city.gov")

    def test_other_contact_requires_valid_email(self) -> None:
        with self.assertRaises(SubmissionTrackerError):
            record_other_contact_response(
                "arizona-marana",
                "code_violation",
                new_contact_email="not-an-email",
                registry=self.registry,
                log_path=self.log_path,
                persist=False,
                auto_send_pdf=False,
            )

    def test_log_response_records_list_file_on_event(self) -> None:
        list_file = {
            "id": "20260610-arizona-marana",
            "filename": "cv-list.xlsx",
            "stored_path": "data/city-response-lists/Arizona/arizona-marana/code_violation/20260610_cv-list.xlsx",
            "uploaded_at": "2026-06-10T12:00:00+00:00",
            "request_type": "code_violation",
            "response_status": "yes",
            "size_bytes": 42,
            "file_type": "excel",
            "file_type_label": "Excel",
        }
        self.registry["cities"][0].setdefault("requests", {}).setdefault("code_violation", {})[
            "list_files"
        ] = [list_file]
        event = log_response(
            "arizona-marana",
            "code_violation",
            "yes",
            response_at="2026-06-10",
            list_file=list_file,
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        self.assertEqual(event["list_file"]["filename"], "cv-list.xlsx")
        self.assertEqual(event["list_file"]["file_type_label"], "Excel")

    def test_log_response_updates_registry(self) -> None:
        log_submission(
            "arizona-marana",
            "code_violation",
            "email_pdf",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        log_response(
            "arizona-marana",
            "code_violation",
            "yes",
            response_raw="Yes",
            response_at="2026-07-15",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        req = self.registry["cities"][0]["requests"]["code_violation"]
        self.assertEqual(req["response_status"], "yes")
        self.assertEqual(req["response_raw"], "Yes")
        self.assertEqual(req["response_at"], "2026-07-15")
        self.assertTrue(req["city_replied"])

    def test_log_response_preserves_full_datetime(self) -> None:
        log_submission(
            "arizona-marana",
            "code_violation",
            "email_pdf",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        response_at = "2026-07-04T09:42:00-07:00"
        event = log_response(
            "arizona-marana",
            "code_violation",
            "yes",
            response_at=response_at,
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        req = self.registry["cities"][0]["requests"]["code_violation"]
        self.assertIn("T", req["response_at"])
        self.assertIn("T", event["response_at"])
        self.assertIsNotNone(req.get("turnaround_days"))
        self.assertEqual(self.registry["cities"][0]["submissions"][0]["action"], "response_received")

    def test_unknown_city_raises(self) -> None:
        with self.assertRaises(SubmissionTrackerError):
            log_submission(
                "arizona-missing",
                "code_violation",
                "online_portal",
                registry=self.registry,
                log_path=self.log_path,
            )

    def test_invalid_request_type_raises(self) -> None:
        with self.assertRaises(SubmissionTrackerError):
            log_submission(
                "arizona-marana",
                "invalid_type",
                "online_portal",
                registry=self.registry,
                log_path=self.log_path,
            )

    def test_submissions_capped_at_20(self) -> None:
        city = self.registry["cities"][0]
        city["submissions"] = [
            {
                "event_id": f"evt-{index}",
                "logged_at": f"2026-07-01T00:00:{index:02d}+00:00",
                "request_type": "code_violation",
                "channel": "online_portal",
                "action": "submitted",
            }
            for index in range(20)
        ]
        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
        )
        self.assertEqual(len(city["submissions"]), 20)
        self.assertNotEqual(city["submissions"][0]["event_id"], "evt-0")

    def test_city_submission_summary(self) -> None:
        summary = city_submission_summary(
            {
                "submissions": [
                    {
                        "logged_at": "2026-07-05T10:00:00+00:00",
                        "channel": "online_portal",
                        "action": "submitted",
                    }
                ]
            }
        )
        self.assertEqual(summary["submission_count"], 1)
        self.assertEqual(summary["last_channel"], "online_portal")

    def test_log_submission_marks_request_fields(self) -> None:
        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        req = self.registry["cities"][0]["requests"]["code_violation"]
        self.assertTrue(req["requested"])
        self.assertTrue(req["requested_at"])

    def test_build_cv_monthly_tracker_counts_fourth_and_responses(self) -> None:
        registry = {
            "version": 1,
            "cities": [
                {
                    "id": "arizona-marana",
                    "city": "Marana",
                    "state": "Arizona",
                    "pathway": "online",
                    "portal_url": "https://example.com",
                    "requests": {
                        "code_violation": {
                            "requested": True,
                            "response_status": "yes",
                        }
                    },
                    "submissions": [],
                },
                {
                    "id": "texas-austin",
                    "city": "Austin",
                    "state": "Texas",
                    "pathway": "online",
                    "portal_url": "https://example.com/austin",
                    "requests": {
                        "code_violation": {
                            "requested": True,
                            "response_status": "pending",
                        }
                    },
                    "submissions": [],
                },
            ],
        }
        log_path = self.log_path
        log_path.write_text(
            "\n".join(
                [
                    json.dumps(
                        {
                            "event_id": "evt-1",
                            "logged_at": "2026-07-04T15:00:00+00:00",
                            "city_id": "arizona-marana",
                            "request_type": "code_violation",
                            "action": "submitted",
                        }
                    ),
                    json.dumps(
                        {
                            "event_id": "evt-2",
                            "logged_at": "2026-07-05T15:00:00+00:00",
                            "city_id": "texas-austin",
                            "request_type": "code_violation",
                            "action": "submitted",
                        }
                    ),
                    json.dumps(
                        {
                            "event_id": "evt-3",
                            "logged_at": "2026-06-04T12:00:00+00:00",
                            "city_id": "arizona-marana",
                            "request_type": "code_violation",
                            "action": "submitted",
                        }
                    ),
                ]
            ),
            encoding="utf-8",
        )

        stats = build_cv_monthly_tracker(registry, log_path=log_path)
        self.assertEqual(stats["total_cities"], 2)
        self.assertEqual(stats["cv_lists_received"], 1)
        self.assertEqual(stats["months"][0]["month"], "2026-07")
        self.assertEqual(stats["months"][0]["requested_on_4th"], 1)
        self.assertEqual(stats["months"][1]["month"], "2026-06")
        self.assertEqual(stats["months"][1]["requested_on_4th"], 1)

    def test_build_submission_kpi_counts_channels(self) -> None:
        self.log_path.write_text(
            "\n".join(
                [
                    json.dumps(
                        {
                            "event_id": "evt-email",
                            "logged_at": "2026-07-05T10:00:00+00:00",
                            "city_id": "arizona-marana",
                            "request_type": "code_violation",
                            "channel": "email_pdf",
                            "action": "submitted",
                        }
                    ),
                    json.dumps(
                        {
                            "event_id": "evt-online",
                            "logged_at": "2026-07-05T11:00:00+00:00",
                            "city_id": "arizona-marana",
                            "request_type": "code_violation",
                            "channel": "online_portal",
                            "action": "submitted",
                        }
                    ),
                ]
            ),
            encoding="utf-8",
        )
        stats = build_submission_kpi(self.registry, log_path=self.log_path)
        self.assertEqual(stats["current_month_email_sent"], 1)
        self.assertEqual(stats["current_month_online_submitted"], 1)
        self.assertEqual(stats["current_month_total_submitted"], 2)
        self.assertIn("workflows", stats)
        self.assertEqual(len(stats["workflows"]), 3)
        self.assertIn("attention", stats)
        self.assertIn("responses", stats)
        self.assertIn("feed", stats["responses"])

    def test_build_tracker_dashboard_workflow_shape(self) -> None:
        from review_portal.submission_tracker import build_tracker_dashboard

        dash = build_tracker_dashboard(self.registry)
        self.assertEqual(len(dash["workflows"]), 3)
        keys = {wf["key"] for wf in dash["workflows"]}
        self.assertEqual(keys, {"online", "pdf", "email_only"})
        for wf in dash["workflows"]:
            self.assertIn(wf["status"], ("active", "done", "blocked"))
            self.assertGreaterEqual(wf["total"], wf["sent"])

    def test_build_response_kpi_counts_and_feed(self) -> None:
        from review_portal.submission_tracker import build_response_kpi, log_response, log_submission

        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        log_response(
            "arizona-marana",
            "code_violation",
            "yes",
            response_at=f"{month_key}-10",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        kpi = build_response_kpi(self.registry, month_key=month_key, log_path=self.log_path)
        self.assertEqual(kpi["month"], month_key)
        self.assertGreaterEqual(kpi["total_responded"], 1)
        self.assertIn("code_violation", kpi["summary"])
        self.assertGreaterEqual(kpi["summary"]["code_violation"]["list_received"], 1)
        self.assertTrue(any(row["city_id"] == "arizona-marana" for row in kpi["feed"]))

    def test_build_response_kpi_excludes_portal_error(self) -> None:
        from review_portal.submission_tracker import build_response_kpi

        city = self.registry["cities"][0]
        city["portal_error"] = True
        city["submissions"] = [
            {
                "action": "submitted",
                "request_type": "code_violation",
                "channel": "online_portal",
                "logged_at": "2026-07-02T12:00:00+00:00",
            },
            {
                "action": "response_received",
                "request_type": "code_violation",
                "response_status": "portal_error",
                "logged_at": "2026-07-05T12:00:00+00:00",
            },
        ]
        kpi = build_response_kpi(self.registry, month_key="2026-07", log_path=self.log_path)
        self.assertEqual(kpi["total_responded"], 0)
        self.assertEqual(kpi["summary"]["code_violation"]["requested"], 0)
        self.assertEqual(kpi["summary"]["code_violation"]["pending"], 0)

    def test_build_submission_kpi_excludes_portal_error_cities(self) -> None:
        city = self.registry["cities"][0]
        city["portal_error"] = True
        self.log_path.write_text(
            json.dumps(
                {
                    "event_id": "evt-portal-error",
                    "logged_at": "2026-07-05T11:00:00+00:00",
                    "city_id": "arizona-marana",
                    "request_type": "code_violation",
                    "channel": "online_portal",
                    "action": "submitted",
                }
            )
            + "\n",
            encoding="utf-8",
        )
        stats = build_submission_kpi(self.registry, log_path=self.log_path)
        self.assertEqual(stats["current_month_online_submitted"], 0)
        self.assertEqual(stats["current_month_total_submitted"], 0)
        online = next(wf for wf in stats["workflows"] if wf["key"] == "online")
        self.assertEqual(online["sent"], 0)

    def test_build_response_kpi_ignores_prior_month_replies(self) -> None:
        from review_portal.submission_tracker import build_response_kpi

        city = self.registry["cities"][0]
        city["requests"]["code_violation"]["response_status"] = "yes"
        city["requests"]["code_violation"]["response_at"] = "2026-05-15"
        city["requests"]["water_shutoff"]["response_status"] = "yes"
        city["requests"]["water_shutoff"]["response_at"] = "2026-04-20"

        kpi = build_response_kpi(self.registry, month_key="2026-07", log_path=self.log_path)
        self.assertEqual(kpi["total_responded"], 0)
        self.assertEqual(kpi["total_requested"], 0)
        self.assertEqual(kpi["summary"]["code_violation"]["list_received"], 0)
        self.assertEqual(kpi["summary"]["water_shutoff"]["list_received"], 0)

    def test_portal_city_payload_includes_tracking(self) -> None:
        city = self.registry["cities"][0]
        payload = portal_city_payload(city, registry=self.registry)
        self.assertIn("tracking", payload)
        self.assertIn("email", payload["tracking"])
        self.assertIn("online", payload["tracking"])
        self.assertIn("average_turnaround_days", payload["tracking"])

    def test_portal_city_summary_payload_is_lightweight(self) -> None:
        city = self.registry["cities"][0]
        summary = portal_city_summary_payload(city)
        full = portal_city_payload(city, registry=self.registry)
        self.assertEqual(summary["id"], full["id"])
        self.assertEqual(summary["cv_response_status"], "pending")
        self.assertEqual(summary["apology_email"], {"show_button": full["apology_email"]["show_button"]})
        self.assertNotIn("tracking", summary)
        self.assertNotIn("submissions", summary)
        self.assertNotIn("portal_url", summary)

    def test_portal_city_tracker_summaries_matches_registry(self) -> None:
        summaries = portal_city_tracker_summaries(self.registry)
        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0]["id"], "arizona-marana")

    def test_compute_city_average_turnaround_from_multiple_responses(self) -> None:
        city = {
            "id": "arizona-marana",
            "requests": {"code_violation": {}, "water_shutoff": {}},
            "submissions": [
                {
                    "event_id": "evt-4",
                    "logged_at": "2026-07-31T12:00:00+00:00",
                    "request_type": "code_violation",
                    "channel": "email_pdf",
                    "action": "response_received",
                    "response_status": "yes",
                    "turnaround_days": 20,
                },
                {
                    "event_id": "evt-3",
                    "logged_at": "2026-07-11T12:00:00+00:00",
                    "request_type": "code_violation",
                    "channel": "email_pdf",
                    "action": "submitted",
                },
                {
                    "event_id": "evt-2",
                    "logged_at": "2026-07-11T12:00:00+00:00",
                    "request_type": "code_violation",
                    "channel": "email_pdf",
                    "action": "response_received",
                    "response_status": "yes",
                    "turnaround_days": 10,
                },
                {
                    "event_id": "evt-1",
                    "logged_at": "2026-07-01T12:00:00+00:00",
                    "request_type": "code_violation",
                    "channel": "email_pdf",
                    "action": "submitted",
                },
            ],
        }
        average = compute_city_average_turnaround(city)
        self.assertEqual(average, 15.0)

    def test_reset_monthly_submissions(self) -> None:
        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        report = reset_monthly_submissions(
            datetime.now(timezone.utc).strftime("%Y-%m"),
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        self.assertGreaterEqual(report["removed_city_events"], 1)
        self.assertEqual(self.registry["cities"][0]["submissions"], [])
        self.log_path.write_text("", encoding="utf-8")
        stats = build_submission_kpi(self.registry, log_path=self.log_path)
        self.assertEqual(stats["current_month_total_submitted"], 0)

    def test_build_turnaround_stats(self) -> None:
        city = self.registry["cities"][0]
        city["requests"]["code_violation"]["turnaround_days"] = 12
        city["requests"]["code_violation"]["response_at"] = "2026-07-20"
        stats = build_turnaround_stats(self.registry)
        self.assertEqual(stats["city_count_with_turnaround"], 1)
        self.assertEqual(stats["average_turnaround_days"], 12.0)

    def test_mark_city_portal_error_reverts_monthly_submission(self) -> None:
        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        result = mark_city_portal_error(
            "arizona-marana",
            notes="Portal 404",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        city = self.registry["cities"][0]
        self.assertTrue(result["portal_error"])
        self.assertTrue(city.get("portal_error"))
        self.assertEqual(city.get("portal_error_notes"), "Portal 404")
        submitted = [
            item
            for item in city.get("submissions", [])
            if item.get("action") == "submitted" and item.get("channel") == "online_portal"
        ]
        self.assertEqual(submitted, [])
        queue = build_pending_online_request_queue(self.registry, log_path=self.log_path)
        self.assertFalse(any(item["id"] == "arizona-marana" for item in queue["items"]))
        self.assertFalse(any(item["id"] == "arizona-marana" for item in queue["blocked"]))
        errors = build_portal_error_queue(self.registry)
        self.assertEqual(errors["total"], 1)
        self.assertEqual(errors["items"][0]["id"], "arizona-marana")

    def test_reclassify_city_as_pdf_form_reverts_submission(self) -> None:
        city = self.registry["cities"][0]
        city["portal_url"] = "https://example.com/records-form.pdf"
        log_submission(
            "arizona-marana",
            "code_violation",
            "online_portal",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        result = reclassify_city_as_pdf_form(
            "arizona-marana",
            notes="Opens a blank PDF",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        city = self.registry["cities"][0]
        self.assertEqual(result["pathway"], "email_pdf")
        self.assertEqual(city.get("pathway"), "email_pdf")
        self.assertEqual(city.get("form_type"), "PDF Email")
        submitted = [
            item
            for item in city.get("submissions", [])
            if item.get("action") == "submitted" and item.get("channel") == "online_portal"
        ]
        self.assertEqual(submitted, [])
        queue = build_pending_online_request_queue(self.registry, log_path=self.log_path)
        self.assertFalse(any(item["id"] == "arizona-marana" for item in queue["items"]))

    def test_pdf_link_urls_excluded_from_online_queue(self) -> None:
        city = self.registry["cities"][0]
        city["portal_url"] = "https://example.com/public-records.pdf?disposition=inline"
        queue = build_pending_online_request_queue(self.registry, log_path=self.log_path)
        self.assertFalse(any(item["id"] == "arizona-marana" for item in queue["items"]))

    def test_clear_city_portal_error_returns_city_to_queue(self) -> None:
        mark_city_portal_error(
            "arizona-marana",
            notes="Broken link",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        clear_city_portal_error(
            "arizona-marana",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        city = self.registry["cities"][0]
        self.assertFalse(city.get("portal_error"))
        queue = build_pending_online_request_queue(self.registry, log_path=self.log_path)
        self.assertTrue(any(item["id"] == "arizona-marana" for item in queue["items"]))

    def test_revert_online_submission_this_month_only(self) -> None:
        city = self.registry["cities"][0]
        city["submissions"] = [
            {
                "event_id": "old",
                "logged_at": "2026-05-01T12:00:00+00:00",
                "request_type": "code_violation",
                "channel": "online_portal",
                "action": "submitted",
            },
            {
                "event_id": "new",
                "logged_at": datetime.now(timezone.utc).isoformat(),
                "request_type": "code_violation",
                "channel": "online_portal",
                "action": "submitted",
            },
        ]
        report = revert_online_submission_this_month(
            "arizona-marana",
            registry=self.registry,
            log_path=self.log_path,
            persist=False,
        )
        self.assertEqual(report["removed_city_events"], 1)
        remaining = city["submissions"]
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["event_id"], "old")


class ApologyQueueConsistencyTests(unittest.TestCase):
    def _sidney_city(self, *, email: str = "records@sidney.gov") -> dict:
        return {
            "id": "ohio-sidney",
            "city": "Sidney",
            "state": "Ohio",
            "pathway": "email_pdf",
            "portal_url": "https://www.sidneyoh.com/DocumentCenter/View/693/Public-Records-Request-Policy-PDF",
            "contact_email": email,
            "requests": {
                "code_violation": {"requested": None, "response_status": "pending", "response_raw": ""},
            },
            "pdf": {
                "status": "completed",
                "user_filled_path": "forms/user-filled/Ohio/ohio-sidney.pdf",
            },
            "submissions": [],
        }

    def test_pending_pdf_queue_item_matches_show_apology_button(self) -> None:
        city = self._sidney_city()
        apology_ids = {"ohio-sidney"}
        apology_sent: dict[str, str] = {}
        payload = pending_pdf_queue_item(
            city,
            apology_pending_ids=apology_ids,
            apology_sent=apology_sent,
        )
        queue = {"pending": list(apology_ids), "sent": apology_sent}
        self.assertEqual(
            payload["apology_email"]["show_button"],
            show_apology_button(city, queue=queue),
        )

    def test_invalid_email_apology_city_goes_to_blocked_not_pending(self) -> None:
        registry = {"cities": [self._sidney_city(email="nan")]}
        with patch("review_portal.submission_tracker.load_registry", return_value=registry):
            with patch(
                "review_portal.apology_email.load_apology_queue",
                return_value={"pending": ["ohio-sidney"], "sent": {}},
            ):
                result = build_pending_pdf_request_queue(registry)
        self.assertEqual(result["total_pending"], 0)
        self.assertEqual(result["total_apology_pending"], 0)
        self.assertEqual(result["total_blocked"], 1)
        blocked = result["blocked"][0]
        self.assertEqual(blocked["id"], "ohio-sidney")
        self.assertTrue(blocked.get("apology_blocked"))
        self.assertIn("email", blocked["blocked_reason"].lower())

    def test_portal_payload_apology_matches_pending_queue_item(self) -> None:
        city = self._sidney_city()
        apology_queue = {"pending": ["ohio-sidney"], "sent": {}}
        registry = {"cities": [city]}
        pending_item = pending_pdf_queue_item(
            city,
            apology_pending_ids={"ohio-sidney"},
            apology_sent={},
        )
        portal_item = portal_city_payload(city, registry=registry, apology_queue=apology_queue)
        self.assertEqual(
            pending_item["apology_email"],
            portal_item["apology_email"],
        )

    def test_pdf_fill_needed_for_email_pdf_without_completed(self) -> None:
        needs = {
            "id": "arizona-benson",
            "city": "Benson",
            "state": "Arizona",
            "pathway": "email_pdf",
            "contact_email": "",
            "pdf": {},
        }
        filled = {
            "id": "ohio-sidney",
            "city": "Sidney",
            "state": "Ohio",
            "pathway": "email_pdf",
            "contact_email": "clerk@example.com",
            "pdf": {
                "status": "completed",
                "user_filled_path": "forms/user-filled/Ohio/ohio-sidney.pdf",
            },
        }
        online = {
            "id": "arizona-marana",
            "city": "Marana",
            "state": "Arizona",
            "pathway": "online",
            "portal_url": "https://example.com",
        }
        self.assertTrue(is_pdf_fill_needed(needs))
        self.assertFalse(is_pdf_fill_needed(filled))
        self.assertFalse(is_pdf_fill_needed(online))

    def test_build_pending_pdf_fill_queue_counts_and_reasons(self) -> None:
        registry = {
            "cities": [
                {
                    "id": "arizona-benson",
                    "city": "Benson",
                    "state": "Arizona",
                    "pathway": "email_pdf",
                    "contact_email": "",
                    "pdf": {},
                },
                {
                    "id": "arizona-coolidge",
                    "city": "Coolidge",
                    "state": "Arizona",
                    "pathway": "email_pdf",
                    "contact_email": "a@b.com",
                    "pdf": {"raw_path": "forms/raw/Arizona/arizona-coolidge.pdf", "status": "pending"},
                },
                {
                    "id": "ohio-sidney",
                    "city": "Sidney",
                    "state": "Ohio",
                    "pathway": "email_pdf",
                    "contact_email": "clerk@example.com",
                    "pdf": {
                        "status": "completed",
                        "user_filled_path": "forms/user-filled/Ohio/ohio-sidney.pdf",
                    },
                },
                {
                    "id": "arizona-marana",
                    "city": "Marana",
                    "state": "Arizona",
                    "pathway": "online",
                    "portal_url": "https://example.com",
                },
            ]
        }
        result = build_pending_pdf_fill_queue(registry)
        self.assertEqual(result["total_pending"], 2)
        self.assertEqual(result["total_with_blank_form"], 1)
        self.assertEqual(result["total_missing_blank"], 1)
        ids = {item["id"] for item in result["items"]}
        self.assertEqual(ids, {"arizona-benson", "arizona-coolidge"})
        by_id = {item["id"]: item for item in result["items"]}
        self.assertFalse(by_id["arizona-benson"]["has_raw_pdf"])
        self.assertTrue(by_id["arizona-coolidge"]["has_raw_pdf"])
        self.assertIn("open=arizona-coolidge", by_id["arizona-coolidge"]["fill_href"])
        item = pending_pdf_fill_queue_item(registry["cities"][0])
        self.assertIn("No blank", item["reason"])


if __name__ == "__main__":
    unittest.main()