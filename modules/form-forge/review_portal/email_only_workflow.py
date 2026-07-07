"""Send plain-email public records requests (no PDF attachment)."""
from __future__ import annotations

from review_portal.email_only import (
    build_email_only_body,
    build_email_only_subject,
    is_email_only_city,
)
from review_portal.gmail_client import send_plain_email
from review_portal.portal_registry import (
    ensure_email_send_allowed,
    find_city,
    load_registry,
    normalize_contact_email,
)
from review_portal.request_status import compute_email_status
from review_portal.submission_tracker import SubmissionTrackerError, log_submission


class EmailOnlyWorkflowError(ValueError):
    pass


def send_city_email_only(
    city_id: str,
    *,
    request_type: str = "code_violation",
    email: str = "",
    subject: str = "",
    body: str = "",
    notes: str = "Sent from Email Only Requests workflow",
    force: bool = False,
) -> dict:
    registry = load_registry()
    city = find_city(registry, city_id)
    if not city:
        raise EmailOnlyWorkflowError(f"Unknown city id: {city_id}")

    if not is_email_only_city(city):
        raise EmailOnlyWorkflowError("This city is not eligible for email-only requests")

    try:
        ensure_email_send_allowed(city)
    except ValueError as exc:
        raise EmailOnlyWorkflowError(str(exc)) from exc

    status = compute_email_status(city, request_type)
    if not force and not status["can_send"]:
        raise EmailOnlyWorkflowError(status.get("blocked_reason") or "Email send is not available yet")

    recipient = normalize_contact_email(email or city.get("contact_email"))
    if not recipient:
        raise EmailOnlyWorkflowError("No valid recipient email on file for this city")

    gmail_result = send_plain_email(
        to=recipient,
        subject=subject or build_email_only_subject(city["city"], city["state"]),
        body=body or build_email_only_body(city["city"], city["state"]),
    )

    try:
        event = log_submission(
            city_id,
            request_type,
            "email_only",
            email=recipient,
            pdf_path="",
            notes=notes,
            registry=registry,
            persist=True,
        )
    except SubmissionTrackerError as exc:
        raise EmailOnlyWorkflowError(str(exc)) from exc

    return {
        "gmail": gmail_result,
        "event": event,
    }