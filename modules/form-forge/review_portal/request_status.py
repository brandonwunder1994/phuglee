"""Request cooldown and channel availability for city submissions."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

COOLDOWN_DAYS = 30
CV_LIST_RESPONSE_STATUSES = frozenset({"yes"})


def _parse_logged_at(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        pass
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _add_days(dt: datetime, days: int) -> datetime:
    return dt + timedelta(days=days)


def format_display_date(iso_or_date: str) -> str:
    dt = _parse_logged_at(iso_or_date)
    if not dt:
        return iso_or_date or ""
    return dt.strftime("%B %d, %Y").replace(" 0", " ")


def format_short_date(iso_or_date: str) -> str:
    dt = _parse_logged_at(iso_or_date)
    if not dt:
        return iso_or_date or ""
    return dt.strftime("%b %d, %Y")


def last_channel_submission(
    city: dict,
    channel: str,
    request_type: str = "code_violation",
) -> dict | None:
    for sub in city.get("submissions") or []:
        if (
            sub.get("action") == "submitted"
            and sub.get("request_type") == request_type
            and sub.get("channel") == channel
        ):
            return sub
    return None


def _last_sent_at(city: dict, channel: str, request_type: str) -> str:
    sub = last_channel_submission(city, channel, request_type)
    if sub:
        return sub.get("logged_at", "")
    if channel in {"email_pdf", "email_only"}:
        for alt in ("email_only", "email_pdf"):
            if alt == channel:
                continue
            alt_sub = last_channel_submission(city, alt, request_type)
            if alt_sub:
                return alt_sub.get("logged_at", "")
    req = (city.get("requests") or {}).get(request_type, {})
    if channel in {"email_pdf", "email_only"}:
        return req.get("last_email_sent_at", "")
    if channel == "online_portal":
        return req.get("last_online_submitted_at", "")
    return ""


def _city_replied(req: dict) -> bool:
    if req.get("city_replied") is True:
        return True
    status = req.get("response_status", "pending")
    return status in CV_LIST_RESPONSE_STATUSES


def compute_email_status(city: dict, request_type: str = "code_violation") -> dict:
    from review_portal.email_only import is_email_only_city
    from review_portal.portal_registry import (
        INVALID_CONTACT_EMAIL_MESSAGE,
        WRONG_CONTACT_EMAIL_MESSAGE,
        contact_email_invalid,
        contact_email_marked_wrong,
    )

    if contact_email_marked_wrong(city):
        return {
            "can_send": False,
            "state": "wrong_email",
            "last_sent_at": "",
            "next_available_at": "",
            "blocked_reason": WRONG_CONTACT_EMAIL_MESSAGE,
            "sent_label": "Wrong email",
        }

    if contact_email_invalid(city):
        return {
            "can_send": False,
            "state": "invalid_email",
            "last_sent_at": "",
            "next_available_at": "",
            "blocked_reason": INVALID_CONTACT_EMAIL_MESSAGE,
            "sent_label": "Invalid email",
        }

    req = (city.get("requests") or {}).get(request_type, {})
    channel = "email_only" if is_email_only_city(city) else "email_pdf"
    last_sent = _last_sent_at(city, channel, request_type)
    now = _now_utc()

    if not last_sent:
        return {
            "can_send": True,
            "state": "ready",
            "last_sent_at": "",
            "next_available_at": "",
            "blocked_reason": "",
            "sent_label": "",
        }

    last_dt = _parse_logged_at(last_sent)
    next_available = _add_days(last_dt, COOLDOWN_DAYS) if last_dt else None
    sent_label = f"Email Sent {format_short_date(last_sent)}"
    replied = _city_replied(req)

    if not replied:
        return {
            "can_send": False,
            "state": "sent_waiting",
            "last_sent_at": last_sent,
            "next_available_at": next_available.isoformat() if next_available else "",
            "blocked_reason": "Waiting for city to reply with county list",
            "sent_label": sent_label,
        }

    if next_available and now < next_available:
        next_label = format_display_date(next_available.isoformat())
        return {
            "can_send": False,
            "state": "cooldown",
            "last_sent_at": last_sent,
            "next_available_at": next_available.isoformat(),
            "blocked_reason": f"You cannot request again until {next_label}",
            "sent_label": sent_label,
        }

    return {
        "can_send": True,
        "state": "ready_after_reply",
        "last_sent_at": last_sent,
        "next_available_at": "",
        "blocked_reason": "",
        "sent_label": sent_label,
    }


def compute_online_status(city: dict, request_type: str = "code_violation") -> dict:
    last_sent = _last_sent_at(city, "online_portal", request_type)
    now = _now_utc()

    if not last_sent:
        return {
            "can_submit": True,
            "state": "ready",
            "last_submitted_at": "",
            "next_available_at": "",
            "blocked_reason": "",
            "submitted_label": "",
        }

    last_dt = _parse_logged_at(last_sent)
    next_available = _add_days(last_dt, COOLDOWN_DAYS) if last_dt else None
    submitted_label = f"Form Submitted {format_short_date(last_sent)}"

    if next_available and now < next_available:
        next_label = format_display_date(next_available.isoformat())
        return {
            "can_submit": False,
            "state": "cooldown",
            "last_submitted_at": last_sent,
            "next_available_at": next_available.isoformat(),
            "blocked_reason": f"You cannot submit again until {next_label}",
            "submitted_label": submitted_label,
        }

    return {
        "can_submit": True,
        "state": "ready",
        "last_submitted_at": last_sent,
        "next_available_at": "",
        "blocked_reason": "",
        "submitted_label": submitted_label,
    }


def compute_turnaround_days(requested_at: str, response_at: str) -> int | None:
    start = _parse_logged_at(requested_at)
    end = _parse_logged_at(response_at)
    if not start or not end:
        return None
    return max(0, (end.date() - start.date()).days)


def request_tracking_payload(city: dict, request_type: str = "code_violation") -> dict:
    req = (city.get("requests") or {}).get(request_type, {})
    email = compute_email_status(city, request_type)
    online = compute_online_status(city, request_type)
    turnaround = req.get("turnaround_days")
    if turnaround is None:
        turnaround = compute_turnaround_days(
            req.get("last_email_sent_at") or req.get("requested_at", ""),
            req.get("response_at", ""),
        )

    return {
        "request_type": request_type,
        "city_replied": _city_replied(req),
        "response_at": req.get("response_at", ""),
        "turnaround_days": turnaround,
        "email": email,
        "online": online,
        "next_request_available": email.get("next_available_at") or online.get("next_available_at", ""),
        "next_request_available_label": (
            format_display_date(email["next_available_at"])
            if email.get("next_available_at")
            else (
                format_display_date(online["next_available_at"])
                if online.get("next_available_at")
                else ""
            )
        ),
    }