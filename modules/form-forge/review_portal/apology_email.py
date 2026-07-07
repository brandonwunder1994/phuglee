"""One-time apology resend for cities that received incorrect PDFs on 2026-07-04."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from review_portal.data_guard import atomic_write_text
from review_portal.gmail_client import send_email_with_attachment
from review_portal.pdf_date_update import refresh_pdf_dates
from review_portal.portal_registry import (
    city_has_completed_pdf,
    contact_email_marked_wrong,
    ensure_email_send_allowed,
    find_city,
    is_valid_contact_email,
    load_registry,
    normalize_contact_email,
)
from review_portal.settings import load_settings
from review_portal.submission_tracker import SubmissionTrackerError, log_submission

ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "data" / "apology-email-queue.json"


class ApologyEmailError(ValueError):
    pass


def load_apology_queue() -> dict:
    if not QUEUE_PATH.exists():
        return {"pending": [], "sent": {}}
    try:
        data = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"pending": [], "sent": {}}
    return {
        "pending": list(data.get("pending") or []),
        "sent": dict(data.get("sent") or {}),
    }


def save_apology_queue(data: dict) -> None:
    payload = {
        "pending": list(data.get("pending") or []),
        "sent": dict(data.get("sent") or {}),
    }
    atomic_write_text(QUEUE_PATH, json.dumps(payload, indent=2) + "\n")


def apology_sent_at(city_id: str, *, queue: dict | None = None) -> str:
    data = queue if queue is not None else load_apology_queue()
    return str(data.get("sent", {}).get(city_id, "") or "")


def show_apology_button(city: dict, *, queue: dict | None = None) -> bool:
    city_id = city.get("id", "")
    if not city_id:
        return False
    if not city_has_completed_pdf(city):
        return False
    if not is_valid_contact_email(city.get("contact_email")):
        return False
    if contact_email_marked_wrong(city):
        return False
    data = queue if queue is not None else load_apology_queue()
    return city_id in data.get("pending", [])


def mark_apology_sent(city_id: str) -> str:
    queue = load_apology_queue()
    pending = [cid for cid in queue.get("pending", []) if cid != city_id]
    sent = dict(queue.get("sent", {}))
    sent_at = datetime.now(timezone.utc).isoformat()
    sent[city_id] = sent_at
    save_apology_queue({"pending": pending, "sent": sent})
    return sent_at


def apology_email_payload(city: dict, *, queue: dict | None = None) -> dict:
    city_id = city.get("id", "")
    sent_at = apology_sent_at(city_id, queue=queue) if city_id else ""
    return {
        "show_button": show_apology_button(city, queue=queue),
        "sent_at": sent_at,
    }


def apology_subject(city_name: str, state: str) -> str:
    return f"Corrected public records request — {city_name}, {state} (sorry about earlier email)"


def apology_body(city_name: str, state: str) -> str:
    settings = load_settings()
    sender = settings.get("name") or "Brandon Wunder"
    request_text = (
        settings.get("request_text")
        or "I am requesting information about any code violations related to tall grass and trash/debris over the past 30 days."
    )
    phone = (settings.get("phone") or "").strip()
    email = (settings.get("email") or "").strip()
    contact_lines = [line for line in (phone, email) if line]
    contact_block = "\n" + "\n".join(contact_lines) if contact_lines else ""

    return (
        f"Hi,\n\n"
        f"Sorry about the earlier email today — I had a mix-up on my end and the public records request I sent for "
        f"{city_name}, {state} had an incomplete form attached.\n\n"
        f"I've attached the corrected form with everything filled in. I'm looking for:\n\n"
        f"{request_text}\n\n"
        f"Thanks for bearing with me.\n\n"
        f"{sender}{contact_block}"
    )


def send_apology_city_pdf_email(
    city_id: str,
    *,
    request_type: str = "code_violation",
    email: str = "",
    subject: str = "",
    body: str = "",
    notes: str = "One-time apology resend with corrected FOIA PDF",
) -> dict:
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        raise ApologyEmailError(f"Unknown city id: {city_id}")

    if not show_apology_button(city):
        raise ApologyEmailError("Apology email is not available for this city")

    try:
        ensure_email_send_allowed(city)
    except ValueError as exc:
        raise ApologyEmailError(str(exc)) from exc

    recipient = normalize_contact_email(email or city.get("contact_email"))
    if not recipient:
        raise ApologyEmailError("No valid recipient email on file for this city")

    pdf = city.get("pdf") or {}
    filled_rel = pdf.get("user_filled_path", "")
    if not filled_rel:
        raise ApologyEmailError("No completed PDF on file for this city")

    filled_path = (ROOT / filled_rel).resolve()
    if not filled_path.exists():
        raise ApologyEmailError("Completed PDF file is missing on disk")

    raw_rel = pdf.get("raw_path", "")
    raw_path = (ROOT / raw_rel).resolve() if raw_rel else None
    refresh_pdf_dates(city_id, raw_path=raw_path, filled_path=filled_path)

    gmail_result = send_email_with_attachment(
        to=recipient,
        subject=subject or apology_subject(city["city"], city["state"]),
        body=body or apology_body(city["city"], city["state"]),
        attachment_path=filled_path,
    )

    try:
        event = log_submission(
            city_id,
            request_type,
            "email_pdf",
            email=recipient,
            pdf_path=filled_rel.replace("\\", "/"),
            notes=notes,
            registry=registry,
            persist=True,
        )
    except SubmissionTrackerError as exc:
        raise ApologyEmailError(str(exc)) from exc

    sent_at = mark_apology_sent(city_id)

    return {
        "gmail": gmail_result,
        "event": event,
        "pdf_path": filled_rel.replace("\\", "/"),
        "apology_sent_at": sent_at,
    }