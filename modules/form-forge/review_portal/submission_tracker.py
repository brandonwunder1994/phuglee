"""Append-only submission logging for portal registry cities."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from review_portal.data_guard import append_jsonl
from review_portal.portal_registry import (
    CV_RESPONSE_MAP,
    WATER_RESPONSE_MAP,
    city_has_completed_pdf,
    clear_portal_error,
    find_city,
    is_portal_error,
    list_city_tracker_cities,
    load_registry,
    save_registry,
    set_portal_error,
    update_city_contact_email,
    update_city_portal_url,
)
from review_portal.request_status import (
    COOLDOWN_DAYS,
    _parse_logged_at,
    compute_email_status,
    compute_online_status,
    compute_turnaround_days,
    request_tracking_payload,
)

ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "data" / "submission-log.jsonl"
MAX_CITY_SUBMISSIONS = 20

REQUEST_TYPES = frozenset({"water_shutoff", "code_violation"})
CHANNELS = frozenset({"online_portal", "email_pdf", "email_only"})
ACTIONS = frozenset({"submitted", "response_received"})

WATER_RESPONSE_STATUSES = frozenset({"pending", *WATER_RESPONSE_MAP.values(), "redirect", "unknown"})
CV_RESPONSE_STATUSES = frozenset({"pending", *CV_RESPONSE_MAP.values(), "unknown"})
CV_LIST_RESPONSE_STATUSES = frozenset({"yes"})
# Real city replies only — excludes internal workflow outcomes (portal errors, PDF reclassify, etc.).
CITY_REPLY_STATUSES = (
    frozenset(WATER_RESPONSE_MAP.values())
    | frozenset(CV_RESPONSE_MAP.values())
    | frozenset({"redirect"})
)
CV_REQUEST_DAY = 4


class SubmissionTrackerError(ValueError):
    pass


def make_event_id(city_id: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{city_id}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_response_at(value: str) -> str:
    """Preserve full ISO datetime when provided; keep date-only for legacy values."""
    raw = (value or _now_iso()).strip()
    if not raw:
        return _now_iso()
    parsed = _parse_logged_at(raw)
    if not parsed:
        return raw[:10] if len(raw) >= 10 else raw
    if "T" in raw or ":" in raw:
        return parsed.isoformat()
    return parsed.date().isoformat()


def _validate_request_type(request_type: str) -> str:
    if request_type not in REQUEST_TYPES:
        raise SubmissionTrackerError(f"Invalid request_type: {request_type}")
    return request_type


def _validate_channel(channel: str) -> str:
    if channel not in CHANNELS:
        raise SubmissionTrackerError(f"Invalid channel: {channel}")
    return channel


def _validate_response_status(request_type: str, response_status: str) -> str:
    allowed = WATER_RESPONSE_STATUSES if request_type == "water_shutoff" else CV_RESPONSE_STATUSES
    if response_status not in allowed:
        raise SubmissionTrackerError(f"Invalid response_status for {request_type}: {response_status}")
    return response_status


def _require_city(registry: dict, city_id: str) -> dict:
    city = find_city(registry, city_id)
    if not city:
        raise SubmissionTrackerError(f"Unknown city id: {city_id}")
    return city


def _summary_fields(event: dict) -> dict:
    summary = {
        "event_id": event["event_id"],
        "logged_at": event["logged_at"],
        "request_type": event["request_type"],
        "channel": event.get("channel", ""),
        "action": event["action"],
        "response_status": event.get("response_status", ""),
    }
    if event.get("response_at"):
        summary["response_at"] = event["response_at"]
    if event.get("turnaround_days") is not None:
        summary["turnaround_days"] = event["turnaround_days"]
    if event.get("notes"):
        summary["notes"] = event["notes"]
    if event.get("response_raw"):
        summary["response_raw"] = event["response_raw"]
    if event.get("new_contact_email"):
        summary["new_contact_email"] = event["new_contact_email"]
    if event.get("previous_contact_email"):
        summary["previous_contact_email"] = event["previous_contact_email"]
    return summary


def sync_city_submissions(city: dict, event: dict) -> None:
    summary = _summary_fields(event)
    submissions = list(city.get("submissions") or [])
    submissions.insert(0, summary)
    city["submissions"] = submissions[:MAX_CITY_SUBMISSIONS]


def append_event(entry: dict, *, log_path: Path | None = None) -> dict:
    target = log_path or LOG_PATH
    append_jsonl(target, entry)
    return entry


def _parse_logged_at(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def read_all_submissions(*, log_path: Path | None = None) -> list[dict]:
    target = log_path or LOG_PATH
    if not target.exists():
        return []
    events: list[dict] = []
    for line in target.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def read_recent_submissions(limit: int = 100, *, log_path: Path | None = None) -> list[dict]:
    target = log_path or LOG_PATH
    if not target.exists():
        return []

    lines = target.read_text(encoding="utf-8").splitlines()
    events: list[dict] = []
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(events) >= limit:
            break
    return events


def _mark_request_logged(
    city: dict,
    request_type: str,
    logged_at: str,
    *,
    channel: str = "",
) -> None:
    req = city.setdefault("requests", {}).setdefault(request_type, {})
    req["requested"] = True
    if logged_at:
        req["requested_at"] = logged_at[:10]
        if channel in {"email_pdf", "email_only"}:
            req["last_email_sent_at"] = logged_at
        elif channel == "online_portal":
            req["last_online_submitted_at"] = logged_at


def _submission_event_key(event: dict, city_id: str = "") -> tuple:
    return (
        event.get("event_id", ""),
        city_id or event.get("city_id", ""),
        event.get("logged_at", ""),
        event.get("action", ""),
        event.get("request_type", ""),
    )


def collect_cv_submission_events(registry: dict, *, log_path: Path | None = None) -> list[dict]:
    seen: set[tuple] = set()
    events: list[dict] = []
    for event in read_all_submissions(log_path=log_path):
        key = _submission_event_key(event)
        if key in seen:
            continue
        seen.add(key)
        events.append(event)
    for city in registry.get("cities", []):
        city_id = city.get("id", "")
        for sub in city.get("submissions") or []:
            key = _submission_event_key(sub, city_id)
            if key in seen:
                continue
            seen.add(key)
            events.append({**sub, "city_id": city_id, "city": city.get("city", ""), "state": city.get("state", "")})
    return events


def build_cv_monthly_tracker(registry: dict | None = None, *, log_path: Path | None = None) -> dict:
    data = registry if registry is not None else load_registry()
    cities = list_city_tracker_cities(data)
    total = len(cities)

    cv_lists_received = sum(
        1
        for city in cities
        if (city.get("requests") or {}).get("code_violation", {}).get("response_status")
        in CV_LIST_RESPONSE_STATUSES
    )

    monthly: dict[str, set[str]] = {}
    for event in collect_cv_submission_events(data, log_path=log_path):
        if event.get("request_type") != "code_violation" or event.get("action") != "submitted":
            continue
        logged_at = _parse_logged_at(event.get("logged_at", ""))
        if not logged_at or logged_at.day != CV_REQUEST_DAY:
            continue
        city_id = event.get("city_id", "")
        if not city_id:
            continue
        month_key = logged_at.strftime("%Y-%m")
        monthly.setdefault(month_key, set()).add(city_id)

    now = datetime.now(timezone.utc)
    current_key = now.strftime("%Y-%m")
    current_requested = len(monthly.get(current_key, set()))

    months = []
    for key in sorted(monthly.keys(), reverse=True):
        count = len(monthly[key])
        month_dt = datetime.strptime(f"{key}-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
        months.append(
            {
                "month": key,
                "label": month_dt.strftime("%B %Y"),
                "requested_on_4th": count,
                "coverage_pct": round(count / total * 100, 1) if total else 0.0,
            }
        )

    return {
        "total_cities": total,
        "request_day": CV_REQUEST_DAY,
        "cv_lists_received": cv_lists_received,
        "cv_list_rate_pct": round(cv_lists_received / total * 100, 1) if total else 0.0,
        "current_month": current_key,
        "current_month_label": now.strftime("%B %Y"),
        "current_month_requested_on_4th": current_requested,
        "current_month_coverage_pct": round(current_requested / total * 100, 1) if total else 0.0,
        "months": months,
    }


def city_submission_summary(city: dict) -> dict:
    submissions = city.get("submissions") or []
    submitted = [item for item in submissions if item.get("action") == "submitted"]
    last = submitted[0] if submitted else None
    return {
        "submission_count": len(submissions),
        "last_submitted_at": last.get("logged_at", "") if last else "",
        "last_channel": last.get("channel", "") if last else "",
    }


def _persist_event(
    registry: dict,
    city: dict,
    event: dict,
    *,
    log_path: Path | None = None,
    persist: bool = True,
) -> dict:
    sync_city_submissions(city, event)
    append_event(event, log_path=log_path)
    if persist:
        save_registry(registry)
    return event


def log_submission(
    city_id: str,
    request_type: str,
    channel: str,
    *,
    email: str = "",
    pdf_path: str = "",
    notes: str = "",
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    request_type = _validate_request_type(request_type)
    channel = _validate_channel(channel)
    owned = registry is None
    data = registry if registry is not None else load_registry()
    city = _require_city(data, city_id)
    should_persist = persist if persist is not None else owned

    logged_at = _now_iso()
    event = {
        "event_id": make_event_id(city_id),
        "logged_at": logged_at,
        "city_id": city_id,
        "city": city["city"],
        "state": city["state"],
        "request_type": request_type,
        "channel": channel,
        "action": "submitted",
        "portal_url": city.get("portal_url", "") if channel == "online_portal" else "",
        "email": email or city.get("contact_email", ""),
        "pdf_path": pdf_path,
        "notes": notes,
    }
    _mark_request_logged(city, request_type, logged_at, channel=channel)
    _persist_event(data, city, event, log_path=log_path, persist=should_persist)
    return event


def log_response(
    city_id: str,
    request_type: str,
    response_status: str,
    *,
    response_raw: str = "",
    response_at: str = "",
    notes: str = "",
    new_contact_email: str = "",
    previous_contact_email: str = "",
    list_file: dict | None = None,
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    request_type = _validate_request_type(request_type)
    response_status = _validate_response_status(request_type, response_status)
    owned = registry is None
    data = registry if registry is not None else load_registry()
    city = _require_city(data, city_id)
    should_persist = persist if persist is not None else owned

    req = city.setdefault("requests", {}).setdefault(request_type, {})
    req["response_status"] = response_status
    if response_raw:
        req["response_raw"] = response_raw
    replied_at = _normalize_response_at(response_at)
    req["response_at"] = replied_at
    req["city_replied"] = response_status in CV_LIST_RESPONSE_STATUSES
    turnaround = compute_turnaround_days(
        req.get("last_email_sent_at") or req.get("last_online_submitted_at") or req.get("requested_at", ""),
        replied_at,
    )
    if turnaround is not None:
        req["turnaround_days"] = turnaround

    if city.get("portal_url"):
        channel = "online_portal"
    elif city.get("contact_email"):
        channel = "email_pdf"
    else:
        channel = "online_portal"

    event = {
        "event_id": make_event_id(city_id),
        "logged_at": _now_iso(),
        "city_id": city_id,
        "city": city["city"],
        "state": city["state"],
        "request_type": request_type,
        "channel": channel,
        "action": "response_received",
        "response_status": response_status,
        "response_raw": response_raw,
        "response_at": replied_at,
        "turnaround_days": turnaround,
        "notes": notes,
    }
    if new_contact_email:
        event["new_contact_email"] = new_contact_email
    if previous_contact_email:
        event["previous_contact_email"] = previous_contact_email
    if list_file:
        event["list_file"] = {
            "id": list_file.get("id", ""),
            "filename": list_file.get("filename", ""),
            "stored_path": list_file.get("stored_path", ""),
            "size_bytes": list_file.get("size_bytes", 0),
            "file_type": list_file.get("file_type", ""),
            "file_type_label": list_file.get("file_type_label", ""),
        }
    _persist_event(data, city, event, log_path=log_path, persist=should_persist)
    return event


def record_other_contact_response(
    city_id: str,
    request_type: str,
    *,
    new_contact_email: str,
    response_raw: str = "",
    response_at: str = "",
    notes: str = "",
    list_file: dict | None = None,
    registry: dict | None = None,
    log_path: Path | None = None,
    auto_send_pdf: bool = True,
    persist: bool | None = None,
) -> dict:
    """Record a city redirect, update contact email, and optionally email the FOIA PDF."""
    from review_portal.email_workflow import EmailWorkflowError, send_city_pdf_email

    owned = registry is None
    should_persist = persist if persist is not None else owned
    data = registry if registry is not None else load_registry()
    city = _require_city(data, city_id)

    try:
        previous_email = update_city_contact_email(city, new_contact_email)
    except ValueError as exc:
        raise SubmissionTrackerError(str(exc)) from exc

    note_parts: list[str] = []
    if previous_email:
        note_parts.append(f"Contact updated from {previous_email} to {new_contact_email.strip()}")
    else:
        note_parts.append(f"Contact set to {new_contact_email.strip()}")
    if notes.strip():
        note_parts.append(notes.strip())
    combined_notes = " · ".join(note_parts)

    event = log_response(
        city_id,
        request_type,
        "other_contact",
        response_raw=response_raw,
        response_at=response_at,
        notes=combined_notes,
        new_contact_email=new_contact_email.strip(),
        previous_contact_email=previous_email,
        list_file=list_file,
        registry=data,
        log_path=log_path,
        persist=should_persist,
    )

    email_result: dict | None = None
    email_error = ""
    if auto_send_pdf and city_has_completed_pdf(city):
        if not should_persist:
            email_error = "Skipped auto-send in non-persisting mode"
        else:
            try:
                email_result = send_city_pdf_email(
                    city_id,
                    request_type=request_type,
                    email=new_contact_email.strip(),
                    notes="Auto-sent to new contact after city redirect",
                    force=True,
                )
            except EmailWorkflowError as exc:
                email_error = str(exc)
    elif auto_send_pdf:
        email_error = "No completed PDF on file — contact updated but nothing was emailed"

    return {
        "event": event,
        "previous_contact_email": previous_email,
        "new_contact_email": new_contact_email.strip(),
        "email_result": email_result,
        "email_error": email_error,
        "email_sent": bool(email_result),
    }


def _event_in_month(event: dict, month_key: str) -> bool:
    logged_at = _parse_logged_at(event.get("logged_at", ""))
    return bool(logged_at and logged_at.strftime("%Y-%m") == month_key)


def _timestamp_in_month(value: str, month_key: str) -> bool:
    logged_at = _parse_logged_at(value)
    return bool(logged_at and logged_at.strftime("%Y-%m") == month_key)


def reset_monthly_submissions(
    month_key: str,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool = True,
) -> dict:
    """Remove logged submissions for a calendar month so KPIs start fresh.

    Historical Excel import fields (e.g. requested_at from June 8) are preserved.
    Only append-only submission events and channel send timestamps are cleared.
    """
    target = log_path or LOG_PATH
    data = registry if registry is not None else load_registry()
    removed_log = 0
    removed_city_events = 0
    cleared_channel_fields = 0

    if target.exists():
        kept_lines: list[str] = []
        for line in target.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                kept_lines.append(line)
                continue
            if _event_in_month(event, month_key):
                removed_log += 1
                continue
            kept_lines.append(line)
        if persist:
            from review_portal.data_guard import atomic_write_text

            text = "\n".join(kept_lines)
            if text:
                text += "\n"
            atomic_write_text(target, text)

    for city in data.get("cities", []):
        submissions = list(city.get("submissions") or [])
        if submissions:
            kept = [item for item in submissions if not _event_in_month(item, month_key)]
            removed_city_events += len(submissions) - len(kept)
            city["submissions"] = kept

        for request_type in REQUEST_TYPES:
            req = (city.get("requests") or {}).get(request_type)
            if not req:
                continue
            for field in ("last_email_sent_at", "last_online_submitted_at"):
                value = req.get(field, "")
                if value and _timestamp_in_month(value, month_key):
                    req.pop(field, None)
                    cleared_channel_fields += 1

    if persist:
        save_registry(data)

    return {
        "month": month_key,
        "removed_log_events": removed_log,
        "removed_city_events": removed_city_events,
        "cleared_channel_fields": cleared_channel_fields,
    }


def _portal_error_city_ids(registry: dict) -> set[str]:
    return {city["id"] for city in registry.get("cities", []) if is_portal_error(city)}


def repair_portal_error_submissions(
    registry: dict | None = None,
    *,
    log_path: Path | None = None,
    month_key: str | None = None,
    persist: bool = True,
) -> dict:
    """Remove mistaken monthly online submissions for cities flagged with portal errors."""
    data = registry if registry is not None else load_registry()
    target = log_path or LOG_PATH
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")

    error_ids = _portal_error_city_ids(data)
    removed_log = 0
    removed_city_events = 0
    cleared_channel_fields = 0

    if target.exists() and error_ids:
        kept_lines: list[str] = []
        for line in target.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                kept_lines.append(line)
                continue
            if (
                event.get("city_id") in error_ids
                and _is_online_submission_event(event, month_key)
            ):
                removed_log += 1
                continue
            kept_lines.append(line)
        if persist:
            from review_portal.data_guard import atomic_write_text

            text = "\n".join(kept_lines)
            if text:
                text += "\n"
            atomic_write_text(target, text)

    for city in data.get("cities", []):
        if city.get("id") not in error_ids:
            continue
        submissions = list(city.get("submissions") or [])
        if submissions:
            kept = [item for item in submissions if not _is_online_submission_event(item, month_key)]
            removed_city_events += len(submissions) - len(kept)
            city["submissions"] = kept
        for request_type in REQUEST_TYPES:
            req = (city.get("requests") or {}).get(request_type)
            if not req:
                continue
            value = req.get("last_online_submitted_at", "")
            if value and _timestamp_in_month(value, month_key):
                req.pop("last_online_submitted_at", None)
                cleared_channel_fields += 1

    if persist:
        save_registry(data)

    return {
        "month": month_key,
        "portal_error_cities": len(error_ids),
        "removed_log_events": removed_log,
        "removed_city_events": removed_city_events,
        "cleared_channel_fields": cleared_channel_fields,
    }


def build_submission_kpi(registry: dict | None = None, *, log_path: Path | None = None) -> dict:
    data = registry if registry is not None else load_registry()
    portal_error_ids = _portal_error_city_ids(data)
    monthly: dict[str, dict[str, int]] = {}
    for event in collect_cv_submission_events(data, log_path=log_path):
        if event.get("action") != "submitted":
            continue
        if event.get("city_id") in portal_error_ids:
            continue
        logged_at = _parse_logged_at(event.get("logged_at", ""))
        if not logged_at:
            continue
        month_key = logged_at.strftime("%Y-%m")
        bucket = monthly.setdefault(
            month_key,
            {"email_pdf": 0, "email_only": 0, "online_portal": 0, "total": 0},
        )
        channel = event.get("channel", "")
        if channel in bucket:
            bucket[channel] += 1
        bucket["total"] += 1

    now = datetime.now(timezone.utc)
    current_key = now.strftime("%Y-%m")
    months = []
    for key in sorted(monthly.keys(), reverse=True):
        month_dt = datetime.strptime(f"{key}-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
        entry = monthly[key]
        months.append(
            {
                "month": key,
                "label": month_dt.strftime("%B %Y"),
                "email_sent": entry["email_pdf"] + entry.get("email_only", 0),
                "email_only_sent": entry.get("email_only", 0),
                "online_submitted": entry["online_portal"],
                "total_submitted": entry["total"],
            }
        )

    current = monthly.get(current_key, {"email_pdf": 0, "email_only": 0, "online_portal": 0, "total": 0})
    email_total = current["email_pdf"] + current.get("email_only", 0)
    dashboard = build_tracker_dashboard(data, log_path=log_path)
    responses = build_response_kpi(data, month_key=current_key, log_path=log_path)
    return {
        "cooldown_days": COOLDOWN_DAYS,
        "current_month": current_key,
        "current_month_label": now.strftime("%B %Y"),
        "current_month_email_sent": email_total,
        "current_month_email_only_sent": current.get("email_only", 0),
        "current_month_online_submitted": current["online_portal"],
        "current_month_total_submitted": current["total"],
        "months": months,
        "workflows": dashboard["workflows"],
        "attention": dashboard["attention"],
        "responses": responses,
    }


def _workflow_progress(
    *,
    key: str,
    label: str,
    href: str,
    sent: int,
    pending: int,
    blocked: int,
    total: int | None = None,
) -> dict:
    eligible = total if total is not None else sent + pending + blocked
    pct = round((sent / eligible) * 100) if eligible else 100
    if pending > 0:
        status = "active"
        status_label = f"{pending} to go"
    elif blocked > 0:
        status = "blocked"
        status_label = f"{blocked} on hold"
    else:
        status = "done"
        status_label = "All done"
    return {
        "key": key,
        "label": label,
        "href": href,
        "sent": sent,
        "pending": pending,
        "blocked": blocked,
        "total": eligible,
        "pct": min(100, pct),
        "status": status,
        "status_label": status_label,
    }


REQUEST_TYPE_LABELS = {
    "code_violation": "Code violations",
    "water_shutoff": "Water shutoffs",
}

RESPONSE_STATUS_LABELS = {
    "yes": "List received",
    "no": "No records of this kind",
    "denied": "Denied",
    "wont_give": "Won't provide",
    "not_available": "Not available",
    "gave_other_info": "Gave other info",
    "other_contact": "City gave other contact",
    "needs_clarification": "Needs clarification — respond to get list",
    "other_source": "Contact another source",
    "approved_bad_data": "Approved (bad data)",
    "approved_parcels": "Approved (parcels)",
    "request_from_pd": "Request from PD",
    "they_charge": "They charge",
    "specific_address_only": "Specific address only",
    "portal_error": "Portal error",
    "pdf_form_url": "PDF form URL",
    "redirect": "Redirected",
    "unknown": "Unknown",
    "pending": "Awaiting reply",
}


def _response_status_label(status: str) -> str:
    key = (status or "pending").strip() or "pending"
    return RESPONSE_STATUS_LABELS.get(key, key.replace("_", " ").title())


def _is_city_reply_status(status: str) -> bool:
    key = (status or "pending").strip() or "pending"
    return key in CITY_REPLY_STATUSES


def request_submitted_this_month(
    city: dict,
    request_type: str,
    *,
    events_by_city: dict[str, list[dict]] | None = None,
    month_key: str | None = None,
) -> bool:
    """True when a request submission was logged in the given calendar month."""
    if is_portal_error(city):
        return False
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    for sub in city.get("submissions") or []:
        if (
            sub.get("action") == "submitted"
            and sub.get("request_type") == request_type
            and _event_in_month(sub, month_key)
        ):
            return True
    req = (city.get("requests") or {}).get(request_type, {})
    for field in ("last_email_sent_at", "last_online_submitted_at"):
        if _timestamp_in_month(req.get(field, ""), month_key):
            return True
    city_id = city.get("id", "")
    if events_by_city and city_id:
        for event in events_by_city.get(city_id, []):
            if (
                event.get("action") == "submitted"
                and event.get("request_type") == request_type
                and _event_in_month(event, month_key)
            ):
                return True
    return False


def response_received_in_month(
    city: dict,
    request_type: str,
    *,
    events_by_city: dict[str, list[dict]] | None = None,
    month_key: str | None = None,
) -> tuple[bool, str, str]:
    """Return (has_response, status, response_at) when a reply was logged in month_key."""
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    city_id = city.get("id", "")
    candidates: list[dict] = list(city.get("submissions") or [])
    if events_by_city and city_id:
        candidates.extend(events_by_city.get(city_id, []))

    for item in candidates:
        if item.get("action") != "response_received":
            continue
        if item.get("request_type") != request_type:
            continue
        at = item.get("response_at") or item.get("logged_at", "")
        if not (_timestamp_in_month(at, month_key) or _event_in_month(item, month_key)):
            continue
        status = (item.get("response_status") or "unknown").strip() or "unknown"
        return True, status, (at or "")[:10]

    req = (city.get("requests") or {}).get(request_type, {})
    response_at = req.get("response_at", "")
    if _timestamp_in_month(response_at, month_key):
        status = (req.get("response_status") or "pending").strip() or "pending"
        if status != "pending":
            return True, status, response_at[:10]
    return False, "pending", ""


def build_response_kpi(
    registry: dict | None = None,
    *,
    month_key: str | None = None,
    log_path: Path | None = None,
) -> dict:
    """Aggregate city response status for City Tracker KPIs (scoped to one calendar month)."""
    data = registry if registry is not None else load_registry()
    now = datetime.now(timezone.utc)
    if month_key is None:
        month_key = now.strftime("%Y-%m")
    month_dt = datetime.strptime(f"{month_key}-01", "%Y-%m-%d").replace(tzinfo=timezone.utc)
    month_label = month_dt.strftime("%B %Y")
    events_by_city = build_events_by_city(data, log_path=log_path)

    summary = {
        "code_violation": {
            "requested": 0,
            "responded": 0,
            "pending": 0,
            "list_received": 0,
            "label": REQUEST_TYPE_LABELS["code_violation"],
        },
        "water_shutoff": {
            "requested": 0,
            "responded": 0,
            "pending": 0,
            "list_received": 0,
            "label": REQUEST_TYPE_LABELS["water_shutoff"],
        },
    }
    feed: list[dict] = []

    for city in list_city_tracker_cities(data):
        for request_type in REQUEST_TYPES:
            if not request_submitted_this_month(
                city,
                request_type,
                events_by_city=events_by_city,
                month_key=month_key,
            ):
                continue
            summary[request_type]["requested"] += 1
            has_response, status, response_at = response_received_in_month(
                city,
                request_type,
                events_by_city=events_by_city,
                month_key=month_key,
            )
            if has_response and _is_city_reply_status(status):
                summary[request_type]["responded"] += 1
                if status == "yes":
                    summary[request_type]["list_received"] += 1
                feed.append(
                    {
                        "city_id": city["id"],
                        "city": city["city"],
                        "state": city["state"],
                        "request_type": request_type,
                        "request_label": REQUEST_TYPE_LABELS[request_type],
                        "response_status": status,
                        "response_label": _response_status_label(status),
                        "response_at": response_at,
                        "href": f"/portal?city={city['id']}",
                    }
                )
            else:
                summary[request_type]["pending"] += 1

    feed.sort(key=lambda row: row.get("response_at") or "", reverse=True)
    total_responded = sum(bucket["responded"] for bucket in summary.values())
    total_pending = sum(bucket["pending"] for bucket in summary.values())
    total_requested = sum(bucket["requested"] for bucket in summary.values())
    return {
        "month": month_key,
        "month_label": month_label,
        "summary": summary,
        "feed": feed[:24],
        "total_responded": total_responded,
        "total_pending": total_pending,
        "total_requested": total_requested,
    }


def build_tracker_dashboard(registry: dict | None = None, *, log_path: Path | None = None) -> dict:
    """Actionable City Tracker summary: workflow progress + items needing attention."""
    data = registry if registry is not None else load_registry()
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    events_by_city = build_events_by_city(data, log_path=log_path)
    online = build_pending_online_request_queue(data, log_path=log_path)
    pdf = build_pending_pdf_request_queue(data)
    email_only = build_pending_email_only_request_queue(data)
    portal_errors = build_portal_error_queue(data)
    summaries = portal_city_tracker_summaries(data)

    cv_pending = 0
    cv_received = 0
    apology_ready = 0
    city_by_id = {city["id"]: city for city in list_city_tracker_cities(data)}
    for row in summaries:
        city = city_by_id.get(row["id"])
        if city and request_submitted_this_month(
            city,
            "code_violation",
            events_by_city=events_by_city,
            month_key=month_key,
        ):
            has_response, status, _ = response_received_in_month(
                city,
                "code_violation",
                events_by_city=events_by_city,
                month_key=month_key,
            )
            if has_response and status in CV_LIST_RESPONSE_STATUSES:
                cv_received += 1
            else:
                cv_pending += 1
        if row.get("apology_email", {}).get("show_button"):
            apology_ready += 1

    pdf_total = (
        pdf["total_sent_this_month"] + pdf["total_pending"] + pdf["total_blocked"]
    )
    email_total = email_only.get("total_eligible") or (
        email_only["total_sent_this_month"]
        + email_only["total_pending"]
        + email_only.get("total_blocked_on_hold", 0)
    )

    workflows = [
        _workflow_progress(
            key="online",
            label="Submit Portals",
            href="/portal/submit-portals",
            sent=online["total_sent_this_month"],
            pending=online["total_pending"],
            blocked=online["total_blocked"],
            total=online.get("total_eligible"),
        ),
        _workflow_progress(
            key="pdf",
            label="Request PDFs",
            href="/portal/request-pdfs",
            sent=pdf["total_sent_this_month"],
            pending=pdf["total_pending"],
            blocked=pdf["total_blocked"],
            total=pdf_total,
        ),
        _workflow_progress(
            key="email_only",
            label="Email Only",
            href="/portal/email-only",
            sent=email_only["total_sent_this_month"],
            pending=email_only["total_pending"],
            blocked=email_only.get("total_blocked_on_hold", 0),
            total=email_total,
        ),
    ]

    attention: list[dict] = []
    if portal_errors["total"]:
        attention.append(
            {
                "key": "portal_errors",
                "label": "Portal errors",
                "count": portal_errors["total"],
                "href": "/portal/portal-errors",
                "hint": "Broken portal URLs to research",
            }
        )
    if apology_ready:
        attention.append(
            {
                "key": "apology",
                "label": "Apology emails",
                "count": apology_ready,
                "href": "/portal/request-pdfs",
                "hint": "Ready to send corrected PDF",
            }
        )
    if cv_pending:
        attention.append(
            {
                "key": "cv_pending",
                "label": "CV responses pending",
                "count": cv_pending,
                "href": "/portal?quick=cv_pending",
                "hint": "Waiting on city code violation reply",
            }
        )
    if email_only.get("total_needs_contact"):
        attention.append(
            {
                "key": "email_needs_contact",
                "label": "Need contact email",
                "count": email_only["total_needs_contact"],
                "href": "/portal/email-only",
                "hint": "Cities missing an email address — research in City Tracker",
            }
        )

    return {
        "workflows": workflows,
        "attention": attention,
        "cv_received": cv_received,
        "tracker_cities": len(summaries),
    }


def build_events_by_city(
    registry: dict,
    *,
    log_path: Path | None = None,
) -> dict[str, list[dict]]:
    """Index merged submission events by city_id (one full log scan)."""
    by_city: dict[str, list[dict]] = {}
    seen: dict[str, set[tuple]] = {}

    for event in collect_cv_submission_events(registry, log_path=log_path):
        city_id = event.get("city_id", "")
        if not city_id:
            continue
        key = _submission_event_key(event, city_id)
        city_seen = seen.setdefault(city_id, set())
        if key in city_seen:
            continue
        city_seen.add(key)
        by_city.setdefault(city_id, []).append(event)

    for city in registry.get("cities", []):
        city_id = city.get("id", "")
        if not city_id:
            continue
        city_seen = seen.setdefault(city_id, set())
        for sub in city.get("submissions") or []:
            key = _submission_event_key(sub, city_id)
            if key in city_seen:
                continue
            city_seen.add(key)
            by_city.setdefault(city_id, []).append({**sub, "city_id": city_id})

    for city_id, events in by_city.items():
        events.sort(key=lambda item: item.get("logged_at", ""))

    return by_city


def collect_city_submission_events(
    city: dict,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    events_by_city: dict[str, list[dict]] | None = None,
) -> list[dict]:
    city_id = city.get("id", "")
    seen: set[tuple] = set()
    events: list[dict] = []

    if events_by_city is not None:
        return list(events_by_city.get(city_id, []))

    if registry is not None:
        for event in collect_cv_submission_events(registry, log_path=log_path):
            if event.get("city_id") != city_id:
                continue
            key = _submission_event_key(event, city_id)
            if key in seen:
                continue
            seen.add(key)
            events.append(event)
    else:
        for sub in city.get("submissions") or []:
            key = _submission_event_key(sub, city_id)
            if key in seen:
                continue
            seen.add(key)
            events.append({**sub, "city_id": city_id})

    events.sort(key=lambda item: item.get("logged_at", ""))
    return events


def city_turnaround_values(
    city: dict,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    events_by_city: dict[str, list[dict]] | None = None,
) -> list[int]:
    events = collect_city_submission_events(
        city,
        registry=registry,
        log_path=log_path,
        events_by_city=events_by_city,
    )
    last_submitted: dict[str, str] = {}
    values: list[int] = []

    for event in events:
        request_type = event.get("request_type", "code_violation")
        action = event.get("action")
        if action == "submitted":
            last_submitted[request_type] = event.get("logged_at", "")
            continue
        if action != "response_received":
            continue

        stored = event.get("turnaround_days")
        if stored is not None:
            values.append(int(stored))
            continue

        submitted_at = last_submitted.get(request_type, "")
        response_at = event.get("response_at") or event.get("logged_at", "")
        days = compute_turnaround_days(submitted_at, response_at)
        if days is not None:
            values.append(days)

    if values:
        return values

    for request_type in REQUEST_TYPES:
        req = (city.get("requests") or {}).get(request_type, {})
        if not req.get("response_at"):
            continue
        days = req.get("turnaround_days")
        if days is None:
            days = compute_turnaround_days(
                req.get("last_email_sent_at") or req.get("last_online_submitted_at") or req.get("requested_at", ""),
                req.get("response_at", ""),
            )
        if days is not None:
            values.append(int(days))

    return values


def compute_city_average_turnaround(
    city: dict,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    events_by_city: dict[str, list[dict]] | None = None,
) -> float | None:
    values = city_turnaround_values(
        city,
        registry=registry,
        log_path=log_path,
        events_by_city=events_by_city,
    )
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def build_turnaround_stats(registry: dict | None = None) -> dict:
    data = registry if registry is not None else load_registry()
    cities = list_city_tracker_cities(data)
    rows: list[dict] = []
    turnaround_values: list[int] = []

    for city in cities:
        req = (city.get("requests") or {}).get("code_violation", {})
        days = req.get("turnaround_days")
        if days is None:
            days = compute_turnaround_days(
                req.get("last_email_sent_at") or req.get("last_online_submitted_at") or req.get("requested_at", ""),
                req.get("response_at", ""),
            )
        if days is None:
            continue
        turnaround_values.append(days)
        rows.append(
            {
                "city_id": city["id"],
                "city": city["city"],
                "state": city["state"],
                "requested_at": req.get("requested_at", ""),
                "response_at": req.get("response_at", ""),
                "turnaround_days": days,
                "response_status": req.get("response_status", "pending"),
            }
        )

    rows.sort(key=lambda row: row["turnaround_days"])
    average = round(sum(turnaround_values) / len(turnaround_values), 1) if turnaround_values else 0.0
    return {
        "city_count_with_turnaround": len(rows),
        "average_turnaround_days": average,
        "cities": rows,
    }


def is_pdf_email_eligible(city: dict) -> bool:
    """Cities with a completed PDF that can be emailed as a FOIA request."""
    if not city_has_completed_pdf(city):
        return False
    pathway = city.get("pathway", "online")
    if pathway in {"email_pdf", "hybrid"}:
        return True
    return bool(city.get("contact_email"))


EMAIL_CHANNELS = frozenset({"email_pdf", "email_only"})


def emailed_this_month(
    city: dict,
    request_type: str = "code_violation",
    *,
    events_by_city: dict[str, list[dict]] | None = None,
    month_key: str | None = None,
) -> bool:
    """True when an email submission was logged in the current calendar month."""
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    for sub in city.get("submissions") or []:
        if (
            sub.get("action") == "submitted"
            and sub.get("request_type") == request_type
            and sub.get("channel") in EMAIL_CHANNELS
            and _event_in_month(sub, month_key)
        ):
            return True
    req = (city.get("requests") or {}).get(request_type, {})
    last = req.get("last_email_sent_at", "")
    if last and _timestamp_in_month(last, month_key):
        return True
    city_id = city.get("id", "")
    if events_by_city and city_id:
        for event in events_by_city.get(city_id, []):
            if (
                event.get("action") == "submitted"
                and event.get("request_type") == request_type
                and event.get("channel") in EMAIL_CHANNELS
                and _event_in_month(event, month_key)
            ):
                return True
    return False


def emailed_email_only_this_month(
    city: dict,
    request_type: str = "code_violation",
    *,
    events_by_city: dict[str, list[dict]] | None = None,
    month_key: str | None = None,
) -> bool:
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    for sub in city.get("submissions") or []:
        if (
            sub.get("action") == "submitted"
            and sub.get("request_type") == request_type
            and sub.get("channel") == "email_only"
            and _event_in_month(sub, month_key)
        ):
            return True
    city_id = city.get("id", "")
    if events_by_city and city_id:
        for event in events_by_city.get(city_id, []):
            if (
                event.get("action") == "submitted"
                and event.get("request_type") == request_type
                and event.get("channel") == "email_only"
                and _event_in_month(event, month_key)
            ):
                return True
    return False


def is_online_portal_eligible(city: dict) -> bool:
    """Cities with an online portal form to submit (not PDF-email or email-only)."""
    from review_portal.email_only import is_email_only_city
    from review_portal.portal_registry import is_pdf_link_url

    if is_portal_error(city):
        return False
    portal_url = (city.get("portal_url") or "").strip()
    if not portal_url:
        return False
    if is_pdf_link_url(portal_url):
        return False
    if city.get("pathway") == "email_pdf":
        return False
    if is_email_only_city(city):
        return False
    return True


def submitted_online_this_month(
    city: dict,
    request_type: str = "code_violation",
    *,
    events_by_city: dict[str, list[dict]] | None = None,
    month_key: str | None = None,
) -> bool:
    """True when an online portal submission was logged in the current calendar month."""
    if is_portal_error(city):
        return False
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    for sub in city.get("submissions") or []:
        if (
            sub.get("action") == "submitted"
            and sub.get("request_type") == request_type
            and sub.get("channel") == "online_portal"
            and _event_in_month(sub, month_key)
        ):
            return True
    req = (city.get("requests") or {}).get(request_type, {})
    last = req.get("last_online_submitted_at", "")
    if last and _timestamp_in_month(last, month_key):
        return True
    city_id = city.get("id", "")
    if events_by_city and city_id:
        for event in events_by_city.get(city_id, []):
            if (
                event.get("action") == "submitted"
                and event.get("request_type") == request_type
                and event.get("channel") == "online_portal"
                and _event_in_month(event, month_key)
            ):
                return True
    return False


def pending_online_queue_item(city: dict) -> dict:
    """Lightweight payload for the Submit Portals workflow page."""
    return {
        "id": city.get("id", ""),
        "city": city["city"],
        "state": city["state"],
        "portal_url": city.get("portal_url", ""),
        "url_notes": city.get("url_notes", ""),
        "form_type": city.get("form_type", "Online"),
        "tracking": {"online": compute_online_status(city, "code_violation")},
    }


def portal_error_queue_item(city: dict) -> dict:
    """Lightweight payload for the Fix Portal Errors workflow page."""
    return {
        "id": city.get("id", ""),
        "city": city["city"],
        "state": city["state"],
        "portal_url": city.get("portal_url", ""),
        "portal_error_url": city.get("portal_error_url", ""),
        "portal_error_notes": city.get("portal_error_notes", ""),
        "portal_error_at": city.get("portal_error_at", ""),
        "url_notes": city.get("url_notes", ""),
        "form_type": city.get("form_type", "Online"),
    }


def _is_online_submission_event(event: dict, month_key: str) -> bool:
    return (
        event.get("action") == "submitted"
        and event.get("channel") == "online_portal"
        and _event_in_month(event, month_key)
    )


def revert_online_submission_this_month(
    city_id: str,
    *,
    month_key: str | None = None,
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool = True,
) -> dict:
    """Remove this month's online_portal submitted events for one city."""
    target = log_path or LOG_PATH
    data = registry if registry is not None else load_registry()
    city = _require_city(data, city_id)
    if month_key is None:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")

    removed_log = 0
    removed_city_events = 0
    cleared_channel_fields = 0

    if target.exists():
        kept_lines: list[str] = []
        for line in target.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                kept_lines.append(line)
                continue
            if (
                event.get("city_id") == city_id
                and _is_online_submission_event(event, month_key)
            ):
                removed_log += 1
                continue
            kept_lines.append(line)
        if persist:
            from review_portal.data_guard import atomic_write_text

            text = "\n".join(kept_lines)
            if text:
                text += "\n"
            atomic_write_text(target, text)

    submissions = list(city.get("submissions") or [])
    if submissions:
        kept = [item for item in submissions if not _is_online_submission_event(item, month_key)]
        removed_city_events = len(submissions) - len(kept)
        city["submissions"] = kept

    for request_type in REQUEST_TYPES:
        req = (city.get("requests") or {}).get(request_type)
        if not req:
            continue
        value = req.get("last_online_submitted_at", "")
        if value and _timestamp_in_month(value, month_key):
            req.pop("last_online_submitted_at", None)
            cleared_channel_fields += 1

    if persist:
        save_registry(data)

    return {
        "city_id": city_id,
        "month": month_key,
        "removed_log_events": removed_log,
        "removed_city_events": removed_city_events,
        "cleared_channel_fields": cleared_channel_fields,
    }


def mark_city_portal_error(
    city_id: str,
    *,
    notes: str = "",
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    """Flag a broken portal URL, revert mistaken monthly submission, and log history."""
    owned = registry is None
    data = registry if registry is not None else load_registry()
    should_persist = persist if persist is not None else owned
    city = _require_city(data, city_id)
    revert = revert_online_submission_this_month(
        city_id,
        registry=data,
        log_path=log_path,
        persist=should_persist,
    )
    set_portal_error(city, notes=notes)
    logged_at = _now_iso()
    month_label = datetime.now(timezone.utc).strftime("%b %d, %Y").replace(" 0", " ")
    detail = notes.strip() or "Portal URL broken or unreachable."
    history_note = (
        f"Portal error ({month_label}) — {detail} "
        "Deferred until URL is fixed. Submission not completed."
    )
    city.setdefault("submissions", []).insert(
        0,
        {
            "event_id": make_event_id(city_id),
            "logged_at": logged_at,
            "request_type": "code_violation",
            "channel": "online_portal",
            "action": "response_received",
            "response_status": "portal_error",
            "notes": history_note,
        },
    )
    if should_persist:
        save_registry(data)
    return {
        "city_id": city_id,
        "portal_error": True,
        "revert": revert,
        "city": portal_city_payload(city, registry=data, log_path=log_path),
    }


def reclassify_city_as_pdf_form(
    city_id: str,
    *,
    notes: str = "",
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    """Revert mistaken online submission and mark the URL as a PDF form (email_pdf)."""
    owned = registry is None
    data = registry if registry is not None else load_registry()
    should_persist = persist if persist is not None else owned
    city = _require_city(data, city_id)
    revert = revert_online_submission_this_month(
        city_id,
        registry=data,
        log_path=log_path,
        persist=False,
    )
    city["pathway"] = "email_pdf"
    city["form_type"] = "PDF Email"
    if is_portal_error(city):
        clear_portal_error(city)
    logged_at = _now_iso()
    month_label = datetime.now(timezone.utc).strftime("%b %d, %Y").replace(" 0", " ")
    detail = notes.strip() or "Portal URL is a downloadable PDF form, not an online portal."
    history_note = (
        f"Reclassified as PDF form ({month_label}) — {detail} "
        "Fill the form in Records Desk, then send via Request PDFs."
    )
    city.setdefault("submissions", []).insert(
        0,
        {
            "event_id": make_event_id(city_id),
            "logged_at": logged_at,
            "request_type": "code_violation",
            "channel": "online_portal",
            "action": "response_received",
            "response_status": "pdf_form_url",
            "notes": history_note,
        },
    )
    if should_persist:
        save_registry(data)
    return {
        "city_id": city_id,
        "pathway": "email_pdf",
        "revert": revert,
        "city": portal_city_payload(city, registry=data, log_path=log_path),
    }


def clear_city_portal_error(
    city_id: str,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    """Clear portal error flag so the city can re-enter the monthly submit queue."""
    owned = registry is None
    data = registry if registry is not None else load_registry()
    should_persist = persist if persist is not None else owned
    city = _require_city(data, city_id)
    clear_portal_error(city)
    if should_persist:
        save_registry(data)
    return {
        "city_id": city_id,
        "portal_error": False,
        "city": portal_city_payload(city, registry=data, log_path=log_path),
    }


def update_city_portal_url_record(
    city_id: str,
    *,
    portal_url: str,
    url_notes: str | None = None,
    registry: dict | None = None,
    log_path: Path | None = None,
    persist: bool | None = None,
) -> dict:
    owned = registry is None
    data = registry if registry is not None else load_registry()
    should_persist = persist if persist is not None else owned
    city = _require_city(data, city_id)
    old_url = update_city_portal_url(city, portal_url, url_notes=url_notes)
    if should_persist:
        save_registry(data)
    return {
        "city_id": city_id,
        "previous_portal_url": old_url,
        "city": portal_city_payload(city, registry=data, log_path=log_path),
    }


def build_portal_error_queue(registry: dict | None = None) -> dict:
    """Cities flagged with broken portal URLs awaiting research and fix."""
    data = registry if registry is not None else load_registry()
    items = [
        portal_error_queue_item(city)
        for city in list_city_tracker_cities(data)
        if is_portal_error(city) and (city.get("portal_url") or city.get("portal_error_url"))
    ]
    items.sort(key=lambda item: (item["state"], item["city"]))
    return {"total": len(items), "items": items}


def build_pending_online_request_queue(
    registry: dict | None = None,
    *,
    log_path: Path | None = None,
) -> dict:
    """Online-portal cities not yet submitted this month and eligible to submit now."""
    data = registry if registry is not None else load_registry()
    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")
    events_by_city = build_events_by_city(data, log_path=log_path)
    pending: list[dict] = []
    blocked: list[dict] = []
    already_sent = 0

    for city in list_city_tracker_cities(data):
        if is_portal_error(city):
            continue
        if not is_online_portal_eligible(city):
            continue
        payload = pending_online_queue_item(city)
        if submitted_online_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        ):
            already_sent += 1
            continue
        online_status = payload.get("tracking", {}).get("online", {})
        if not online_status.get("can_submit"):
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": online_status.get("blocked_reason", ""),
                    "sent_label": online_status.get("submitted_label", ""),
                }
            )
            continue
        pending.append(payload)

    pending.sort(key=lambda item: (item["state"], item["city"]))
    blocked.sort(key=lambda item: (item["state"], item["city"]))
    total_eligible = len(pending) + already_sent + len(blocked)

    return {
        "current_month": month_key,
        "current_month_label": now.strftime("%B %Y"),
        "total_pending": len(pending),
        "total_blocked": len(blocked),
        "total_sent_this_month": already_sent,
        "total_eligible": total_eligible,
        "items": pending,
        "blocked": blocked,
    }


def _apology_blocked_reason(city: dict) -> str:
    """Human-readable reason an apology-pending city cannot send yet."""
    from review_portal.portal_registry import (
        INVALID_CONTACT_EMAIL_MESSAGE,
        WRONG_CONTACT_EMAIL_MESSAGE,
        contact_email_invalid,
        contact_email_marked_wrong,
        is_valid_contact_email,
    )

    if contact_email_marked_wrong(city):
        return WRONG_CONTACT_EMAIL_MESSAGE
    if contact_email_invalid(city):
        return INVALID_CONTACT_EMAIL_MESSAGE
    if not is_valid_contact_email(city.get("contact_email")):
        return "No valid contact email on file — add one in City Tracker before sending apology"
    if not city_has_completed_pdf(city):
        return "Completed PDF missing — finish the form before sending apology"
    return "Apology send is not available for this city"


def pending_pdf_queue_item(
    city: dict,
    *,
    apology_pending_ids: set[str],
    apology_sent: dict[str, str],
) -> dict:
    """Lightweight payload for the Request PDFs workflow page."""
    from review_portal.apology_email import apology_email_payload

    pdf = city.get("pdf") or {}
    filled_path = pdf.get("user_filled_path", "")
    pdf_file_url = f"/api/file/{filled_path.replace(chr(92), '/')}" if filled_path else ""
    city_id = city.get("id", "")
    apology_queue = {"pending": list(apology_pending_ids), "sent": apology_sent}
    apology = apology_email_payload(city, queue=apology_queue)
    return {
        "id": city_id,
        "city": city["city"],
        "state": city["state"],
        "contact_email": city.get("contact_email", ""),
        "pdf": pdf,
        "pdf_file_url": pdf_file_url,
        "apology_email": apology,
        "tracking": {"email": compute_email_status(city, "code_violation")},
    }


def build_pending_pdf_request_queue(registry: dict | None = None) -> dict:
    """PDF-email cities not yet sent this month and eligible to send now.

    Cities needing a one-time apology resend stay in the queue even when they
    were already emailed this month or regular send is blocked.
    """
    from review_portal.apology_email import load_apology_queue

    data = registry if registry is not None else load_registry()
    apology_data = load_apology_queue()
    apology_pending_ids = set(apology_data.get("pending") or [])
    apology_sent = dict(apology_data.get("sent") or {})
    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")
    events_by_city = build_events_by_city(data)
    pending: list[dict] = []
    blocked: list[dict] = []
    already_sent = 0
    apology_pending = 0

    from review_portal.portal_registry import WRONG_CONTACT_EMAIL_MESSAGE, contact_email_marked_wrong

    for city in list_city_tracker_cities(data):
        if not is_pdf_email_eligible(city):
            continue
        city_id = city.get("id", "")
        if contact_email_marked_wrong(city):
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": WRONG_CONTACT_EMAIL_MESSAGE,
                    "sent_label": "Wrong email",
                }
            )
            continue
        payload = pending_pdf_queue_item(
            city,
            apology_pending_ids=apology_pending_ids,
            apology_sent=apology_sent,
        )
        needs_apology = payload.get("apology_email", {}).get("show_button")
        if needs_apology:
            pending.append(payload)
            apology_pending += 1
            continue
        if city_id in apology_pending_ids:
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": _apology_blocked_reason(city),
                    "sent_label": "Apology blocked",
                    "apology_blocked": True,
                }
            )
            continue
        if city_id in apology_sent or emailed_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        ):
            already_sent += 1
            continue
        email_status = payload.get("tracking", {}).get("email", {})
        if not email_status.get("can_send"):
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": email_status.get("blocked_reason", ""),
                    "sent_label": email_status.get("sent_label", ""),
                }
            )
            continue
        pending.append(payload)

    pending.sort(
        key=lambda item: (
            0 if item.get("apology_email", {}).get("show_button") else 1,
            item["state"],
            item["city"],
        )
    )
    blocked.sort(key=lambda item: (item["state"], item["city"]))

    return {
        "current_month": month_key,
        "current_month_label": now.strftime("%B %Y"),
        "total_pending": len(pending),
        "total_apology_pending": apology_pending,
        "total_blocked": len(blocked),
        "total_sent_this_month": already_sent,
        "items": pending,
        "blocked": blocked,
    }


def pending_email_only_queue_item(city: dict) -> dict:
    from review_portal.email_only import build_email_only_body, build_email_only_subject

    return {
        "id": city.get("id", ""),
        "city": city["city"],
        "state": city["state"],
        "contact_email": city.get("contact_email", ""),
        "pathway": city.get("pathway", ""),
        "form_type": city.get("form_type", ""),
        "url_notes": city.get("url_notes", ""),
        "email_subject_preview": build_email_only_subject(city["city"], city["state"]),
        "email_body_preview": build_email_only_body(city["city"], city["state"]),
        "tracking": {"email": compute_email_status(city, "code_violation")},
    }


def build_pending_email_only_request_queue(registry: dict | None = None) -> dict:
    """Plain-email cities (no PDF) not yet sent this month and eligible to send now."""
    from review_portal.email_only import (
        EMAIL_ONLY_BLOCKED_NO_CONTACT,
        city_lacks_portal_and_email,
        is_email_only_city,
        is_email_only_workflow_city,
    )

    data = registry if registry is not None else load_registry()
    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")
    events_by_city = build_events_by_city(data)
    pending: list[dict] = []
    blocked: list[dict] = []
    already_sent = 0
    needs_contact = 0

    from review_portal.portal_registry import WRONG_CONTACT_EMAIL_MESSAGE, contact_email_marked_wrong

    for city in data.get("cities", []):
        if not is_email_only_workflow_city(city):
            continue
        if city_lacks_portal_and_email(city):
            needs_contact += 1
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": EMAIL_ONLY_BLOCKED_NO_CONTACT,
                    "sent_label": "Needs email",
                    "url_notes": city.get("url_notes", ""),
                }
            )
            continue
        if not is_email_only_city(city):
            continue
        if contact_email_marked_wrong(city):
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": WRONG_CONTACT_EMAIL_MESSAGE,
                    "sent_label": "Wrong email",
                }
            )
            continue
        payload = pending_email_only_queue_item(city)
        if emailed_email_only_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        ) or emailed_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        ):
            already_sent += 1
            continue
        email_status = payload.get("tracking", {}).get("email", {})
        if not email_status.get("can_send"):
            blocked.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "blocked_reason": email_status.get("blocked_reason", ""),
                    "sent_label": email_status.get("sent_label", ""),
                }
            )
            continue
        pending.append(payload)

    pending.sort(key=lambda item: (item["state"], item["city"]))
    blocked.sort(key=lambda item: (item["state"], item["city"]))
    blocked_on_hold = len(blocked) - needs_contact
    total_eligible = already_sent + len(pending) + blocked_on_hold

    return {
        "current_month": month_key,
        "current_month_label": now.strftime("%B %Y"),
        "total_pending": len(pending),
        "total_blocked": len(blocked),
        "total_blocked_on_hold": blocked_on_hold,
        "total_needs_contact": needs_contact,
        "total_sent_this_month": already_sent,
        "total_eligible": total_eligible,
        "items": pending,
        "blocked": blocked,
    }


def is_pdf_fill_needed(city: dict) -> bool:
    """True when city is on the PDF-email pathway but has no completed filled FOIA PDF."""
    if city_has_completed_pdf(city):
        return False
    return city.get("pathway") == "email_pdf"


def pending_pdf_fill_queue_item(city: dict) -> dict:
    """Lightweight payload for Collect / Records Desk PDF fill intake."""
    pdf = city.get("pdf") or {}
    has_raw = bool(pdf.get("raw_path"))
    if has_raw:
        reason = "Blank form attached — still needs field fill + save"
    else:
        reason = "FOIA PDF link known but not attached yet — open Records Desk and Attach FOIA PDF"
    city_id = city.get("id", "")
    return {
        "id": city_id,
        "city": city.get("city", ""),
        "state": city.get("state", ""),
        "contact_email": city.get("contact_email", "") or "",
        "has_raw_pdf": has_raw,
        "pdf_status": str(pdf.get("status") or ""),
        "reason": reason,
        "fill_href": f"/forge/?returnTo=collect&open={city_id}",
    }


def build_pending_pdf_fill_queue(registry: dict | None = None) -> dict:
    """PDF-email pathway cities that still need a one-time filled FOIA form."""
    data = registry if registry is not None else load_registry()
    items: list[dict] = []
    for city in data.get("cities", []):
        if not is_pdf_fill_needed(city):
            continue
        items.append(pending_pdf_fill_queue_item(city))
    items.sort(key=lambda item: (item.get("state", ""), item.get("city", "")))
    with_raw = sum(1 for item in items if item.get("has_raw_pdf"))
    return {
        "total_pending": len(items),
        "total_with_blank_form": with_raw,
        "total_missing_blank": len(items) - with_raw,
        "items": items,
    }


def audit_email_only_cities(
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    lookback_days: int = 2,
) -> dict:
    """Report email-only cities, tracker visibility, and recent send status."""
    from review_portal.email_only import city_lacks_portal_and_email, is_email_only_city
    from review_portal.portal_registry import include_in_city_tracker

    data = registry if registry is not None else load_registry()
    events_by_city = build_events_by_city(data, log_path=log_path)
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")

    email_only_rows: list[dict] = []
    no_contact_rows: list[dict] = []

    for city in data.get("cities", []):
        if city_lacks_portal_and_email(city):
            no_contact_rows.append(
                {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "in_tracker": include_in_city_tracker(city),
                }
            )
            continue
        if not is_email_only_city(city):
            continue

        city_id = city["id"]
        recent_event = None
        for event in reversed(events_by_city.get(city_id, [])):
            if event.get("action") != "submitted":
                continue
            if event.get("channel") not in EMAIL_CHANNELS:
                continue
            logged_at = _parse_logged_at(event.get("logged_at", ""))
            if logged_at and logged_at >= cutoff:
                recent_event = event
                break

        sent_this_month = emailed_email_only_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        ) or emailed_this_month(
            city,
            events_by_city=events_by_city,
            month_key=month_key,
        )

        email_only_rows.append(
            {
                "id": city_id,
                "city": city["city"],
                "state": city["state"],
                "contact_email": city.get("contact_email", ""),
                "pathway": city.get("pathway", ""),
                "in_tracker": include_in_city_tracker(city),
                "sent_this_month": sent_this_month,
                "recent_send_within_lookback": bool(recent_event),
                "recent_logged_at": recent_event.get("logged_at", "") if recent_event else "",
                "recent_channel": recent_event.get("channel", "") if recent_event else "",
                "needs_backfill": bool(recent_event) and not sent_this_month,
            }
        )

    return {
        "lookback_days": lookback_days,
        "email_only_total": len(email_only_rows),
        "email_only_in_tracker": sum(1 for row in email_only_rows if row["in_tracker"]),
        "email_only_sent_this_month": sum(1 for row in email_only_rows if row["sent_this_month"]),
        "needs_backfill": [row for row in email_only_rows if row["needs_backfill"]],
        "email_only": email_only_rows,
        "no_portal_or_email": no_contact_rows,
    }


def backfill_email_only_submission(
    city_id: str,
    logged_at: str,
    *,
    request_type: str = "code_violation",
    email: str = "",
    notes: str = "Backfilled email-only submission",
    registry: dict | None = None,
    log_path: Path | None = None,
) -> dict:
    """Record an email-only send with a specific timestamp for KPI tracking."""
    data = registry if registry is not None else load_registry()
    city = _require_city(data, city_id)
    request_type = _validate_request_type(request_type)
    channel = "email_only"

    event = {
        "event_id": make_event_id(city_id),
        "logged_at": logged_at,
        "city_id": city_id,
        "city": city["city"],
        "state": city["state"],
        "request_type": request_type,
        "channel": channel,
        "action": "submitted",
        "portal_url": "",
        "email": email or city.get("contact_email", ""),
        "pdf_path": "",
        "notes": notes,
    }
    _mark_request_logged(city, request_type, logged_at, channel=channel)
    _persist_event(data, city, event, log_path=log_path, persist=True)
    return event


def portal_city_payload(
    city: dict,
    *,
    registry: dict | None = None,
    log_path: Path | None = None,
    events_by_city: dict[str, list[dict]] | None = None,
    apology_queue: dict | None = None,
) -> dict:
    summary = city_submission_summary(city)
    pdf = city.get("pdf") or {}
    filled_path = pdf.get("user_filled_path", "")
    pdf_file_url = f"/api/file/{filled_path.replace(chr(92), '/')}" if filled_path else ""
    tracking = request_tracking_payload(city, "code_violation")
    tracking["average_turnaround_days"] = compute_city_average_turnaround(
        city,
        registry=registry,
        log_path=log_path,
        events_by_city=events_by_city,
    )
    from review_portal.apology_email import apology_email_payload
    from review_portal.bridge_dataset import city_bridge_datasets
    from review_portal.city_list_upload import city_response_list_files
    from review_portal.email_only import city_lacks_portal_and_email, is_email_only_city
    from review_portal.portal_registry import contact_email_invalid

    return {
        "id": city["id"],
        "city": city["city"],
        "state": city["state"],
        "pathway": city.get("pathway", "online"),
        "is_email_only": is_email_only_city(city),
        "lacks_portal_and_email": city_lacks_portal_and_email(city),
        "portal_url": city.get("portal_url", ""),
        "contact_email": city.get("contact_email", ""),
        "contact_email_wrong": bool(city.get("contact_email_wrong")),
        "contact_email_invalid": contact_email_invalid(city),
        "portal_error": is_portal_error(city),
        "portal_error_at": city.get("portal_error_at", ""),
        "portal_error_notes": city.get("portal_error_notes", ""),
        "portal_error_url": city.get("portal_error_url", ""),
        "url_notes": city.get("url_notes", ""),
        "form_type": city.get("form_type", "Online"),
        "requests": city.get("requests", {}),
        "submissions": city.get("submissions", []),
        "pdf": pdf,
        "pdf_status": pdf.get("status", ""),
        "pdf_file_url": pdf_file_url,
        "has_completed_pdf": bool(pdf.get("status") == "completed" and filled_path),
        "editor_url": f"/?open={city['id']}" if pdf else "",
        "tracking": tracking,
        "apology_email": apology_email_payload(city, queue=apology_queue),
        "response_lists": city_response_list_files(city),
        "bridge_datasets": city_bridge_datasets(city),
        **summary,
    }


def portal_city_summary_payload(
    city: dict,
    *,
    apology_queue: dict | None = None,
) -> dict:
    """Lightweight row for City Tracker list, search, and filters."""
    from review_portal.apology_email import apology_email_payload
    from review_portal.email_only import city_lacks_portal_and_email, is_email_only_city
    from review_portal.portal_registry import contact_email_invalid

    pdf = city.get("pdf") or {}
    filled_path = pdf.get("user_filled_path", "")
    cv = (city.get("requests") or {}).get("code_violation", {})
    apology = apology_email_payload(city, queue=apology_queue)
    return {
        "id": city["id"],
        "city": city["city"],
        "state": city["state"],
        "pathway": city.get("pathway", "online"),
        "is_email_only": is_email_only_city(city),
        "lacks_portal_and_email": city_lacks_portal_and_email(city),
        "has_completed_pdf": bool(pdf.get("status") == "completed" and filled_path),
        "cv_response_status": cv.get("response_status") or "pending",
        "contact_email_wrong": bool(city.get("contact_email_wrong")),
        "contact_email_invalid": contact_email_invalid(city),
        "portal_error": is_portal_error(city),
        "apology_email": {"show_button": bool(apology.get("show_button"))},
    }


def portal_city_tracker_summaries(
    registry: dict | None = None,
) -> list[dict]:
    """Build all City Tracker summary rows (one apology queue read)."""
    from review_portal.apology_email import load_apology_queue

    data = registry if registry is not None else load_registry()
    apology_queue = load_apology_queue()
    return [
        portal_city_summary_payload(city, apology_queue=apology_queue)
        for city in list_city_tracker_cities(data)
    ]


def portal_city_tracker_items(
    registry: dict | None = None,
    *,
    log_path: Path | None = None,
) -> list[dict]:
    """Build all City Tracker payloads with shared indexes (one log + apology read)."""
    from review_portal.apology_email import load_apology_queue

    data = registry if registry is not None else load_registry()
    apology_queue = load_apology_queue()
    events_by_city = build_events_by_city(data, log_path=log_path)
    return [
        portal_city_payload(
            city,
            registry=data,
            log_path=log_path,
            events_by_city=events_by_city,
            apology_queue=apology_queue,
        )
        for city in list_city_tracker_cities(data)
    ]