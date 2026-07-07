"""Send a dated PDF to a city via Gmail and log the submission."""
from __future__ import annotations

from pathlib import Path

from review_portal.gmail_client import send_email_with_attachment
from review_portal.pdf_date_update import refresh_pdf_dates
from review_portal.portal_registry import (
    ensure_email_send_allowed,
    find_city,
    load_registry,
    normalize_contact_email,
)
from review_portal.request_status import compute_email_status
from review_portal.settings import load_settings
from review_portal.submission_tracker import SubmissionTrackerError, log_submission

ROOT = Path(__file__).resolve().parents[1]


class EmailWorkflowError(ValueError):
    pass


def _default_email_body(city_name: str, state: str) -> str:
    settings = load_settings()
    sender = settings.get("name") or "Brandon Wunder"
    request_text = settings.get("request_text") or "Please see the attached public records request form."
    return (
        f"Hello,\n\n"
        f"Please find attached my public records request for {city_name}, {state}.\n\n"
        f"{request_text}\n\n"
        f"Thank you,\n{sender}"
    )


def _default_subject(city_name: str, state: str) -> str:
    return f"Public Records Request — {city_name}, {state}"


def send_city_pdf_email(
    city_id: str,
    *,
    request_type: str = "code_violation",
    email: str = "",
    subject: str = "",
    body: str = "",
    notes: str = "Sent from Form Forge",
    force: bool = False,
) -> dict:
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        raise EmailWorkflowError(f"Unknown city id: {city_id}")

    try:
        ensure_email_send_allowed(city)
    except ValueError as exc:
        raise EmailWorkflowError(str(exc)) from exc

    status = compute_email_status(city, request_type)
    if not force and not status["can_send"]:
        raise EmailWorkflowError(status.get("blocked_reason") or "Email send is not available yet")

    recipient = normalize_contact_email(email or city.get("contact_email"))
    if not recipient:
        raise EmailWorkflowError("No valid recipient email on file for this city")

    pdf = city.get("pdf") or {}
    filled_rel = pdf.get("user_filled_path", "")
    if not filled_rel:
        raise EmailWorkflowError("No completed PDF on file for this city")

    filled_path = (ROOT / filled_rel).resolve()
    if not filled_path.exists():
        raise EmailWorkflowError("Completed PDF file is missing on disk")

    raw_rel = pdf.get("raw_path", "")
    raw_path = (ROOT / raw_rel).resolve() if raw_rel else None
    refresh_pdf_dates(city_id, raw_path=raw_path, filled_path=filled_path)

    gmail_result = send_email_with_attachment(
        to=recipient,
        subject=subject or _default_subject(city["city"], city["state"]),
        body=body or _default_email_body(city["city"], city["state"]),
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
        raise EmailWorkflowError(str(exc)) from exc

    return {
        "gmail": gmail_result,
        "event": event,
        "pdf_path": filled_rel.replace("\\", "/"),
    }