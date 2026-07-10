"""Normalize and merge online portal city records from Excel imports."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "data" / "portal-registry.json"
REPORT_PATH = ROOT / "data" / "import-report.json"
DEFAULT_EXCEL = Path(r"C:\Users\brand\Desktop\Online City Portal Forms.xlsx")

# Lower-48 scope: exclude Alaska (and block re-import from sticking).
EXCLUDED_STATES = frozenset({"Alaska"})

# Lead requests cannot be filed in these states.
LEADS_UNAVAILABLE_STATES = frozenset({
    "Alabama",
    "Arkansas",
    "Delaware",
    "Kentucky",
    "South Carolina",
    "Tennessee",
    "Virginia",
})

EXCEL_COLUMNS = {
    "city": "City",
    "state": "State",
    "water_requested": "Water Shut Off Requested?",
    "water_response": "Did they send back water shut offs yet?",
    "url": "URL",
    "cv_requested": "Code Violation Requested on Jun 8th 2026?",
    "cv_response": "CV Sent Back fomr the June 8th 2026 request?",
    "form_type": "Form Type",
}

STATE_ALIASES = {
    "co": "Colorado",
}

WATER_RESPONSE_MAP = {
    "yes": "yes",
    "no": "no",
    "wont give": "wont_give",
    "said they cant provide": "wont_give",
    "said they legally cant give me": "wont_give",
    "said they dont have": "not_available",
    "does not have": "not_available",
    "doesnt have": "not_available",
    "needs clarification": "needs_clarification",
    "needs_clarification": "needs_clarification",
    "other source": "other_source",
    "other_source": "other_source",
    "contact another source": "other_source",
}

CV_RESPONSE_MAP = {
    "yes": "yes",
    "no": "no",
    "denied": "denied",
    "gave other info": "gave_other_info",
    "city gave us other contact": "other_contact",
    "city gave other contact": "other_contact",
    "approved (bad data)": "approved_bad_data",
    "approved (parcels)": "approved_parcels",
    "request from pd": "request_from_pd",
    "they charge": "they_charge",
    "specifc address only": "specific_address_only",
    "specific address only": "specific_address_only",
    "said they don't have": "no",
    "said they dont have": "no",
    "needs clarification": "needs_clarification",
    "needs_clarification": "needs_clarification",
    "other source": "other_source",
    "other_source": "other_source",
    "contact another source": "other_source",
}

URL_RE = re.compile(r"https?://[^\s\]>]+", re.IGNORECASE)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def slugify(state: str, city: str) -> str:
    raw = f"{state}-{city}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")


_PLACEHOLDER_EMAILS = frozenset({"nan", "none", "null", "n/a", "na", "#n/a"})


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and str(value) == "nan":
        return True
    text = str(value).strip()
    if not text:
        return True
    return text.lower() in _PLACEHOLDER_EMAILS


def normalize_contact_email(value: Any) -> str:
    """Return a cleaned email or empty string for missing/placeholder/invalid values."""
    if _is_blank(value):
        return ""
    cleaned = str(value).strip()
    if EMAIL_RE.fullmatch(cleaned):
        return cleaned
    return ""


def is_valid_contact_email(value: Any) -> bool:
    return bool(normalize_contact_email(value))


def _clean_text(value: Any) -> str:
    if _is_blank(value):
        return ""
    return str(value).strip()


def normalize_state(state: str) -> str:
    text = _clean_text(state)
    if not text:
        return ""
    lowered = text.lower()
    if lowered in STATE_ALIASES:
        return STATE_ALIASES[lowered]
    if len(text) == 2 and text.isalpha():
        return text.upper()
    return text.title()


def parse_yes_no(value: Any) -> bool | None:
    if _is_blank(value):
        return None
    text = _clean_text(value).lower()
    if text in {"yes", "y", "true"}:
        return True
    if text in {"no", "n", "false"}:
        return False
    return None


def extract_url_and_email(raw: Any) -> tuple[str, str, str]:
    text = _clean_text(raw)
    if not text:
        return "", "", ""

    email = ""
    email_match = EMAIL_RE.search(text)
    if email_match and "@" in text and not text.lower().startswith("http"):
        candidate = email_match.group(0)
        if text.strip().lower() == candidate.lower() or "@" in text and "http" not in text.lower():
            email = candidate

    portal_url = ""
    url_match = URL_RE.search(text)
    if url_match:
        portal_url = url_match.group(0).rstrip(".,;)")

    notes = ""
    if text and (portal_url or email):
        remainder = text
        if portal_url:
            remainder = remainder.replace(portal_url, "").strip()
        if email and remainder.lower() == email.lower():
            remainder = ""
        elif email:
            remainder = remainder.replace(email, "").strip()
        if remainder:
            notes = remainder
    elif text and not portal_url and not email:
        notes = text

    return portal_url, email, notes


def _map_response(raw: Any, mapping: dict[str, str], default: str = "unknown") -> tuple[str, str]:
    text = _clean_text(raw)
    if not text:
        return "pending", ""
    lowered = text.lower()
    if lowered in mapping:
        return mapping[lowered], text
    if lowered.startswith("http"):
        return "redirect", text
    if len(text) > 80 or "contact" in lowered or "reach out" in lowered or "portal" in lowered:
        return "redirect", text
    return default, text


def normalize_water_response(raw: Any) -> tuple[str, str]:
    return _map_response(raw, WATER_RESPONSE_MAP)


def normalize_cv_response(raw: Any) -> tuple[str, str]:
    return _map_response(raw, CV_RESPONSE_MAP)


def is_pdf_link_url(url: str) -> bool:
    """True when a URL points at a downloadable PDF form, not an online portal."""
    text = (url or "").strip()
    if not text:
        return False
    path = text.split("?", 1)[0].split("#", 1)[0]
    return path.lower().endswith(".pdf")


def _pathway(portal_url: str, contact_email: str) -> str:
    if portal_url and contact_email:
        return "hybrid"
    if contact_email and not portal_url:
        return "email_only"
    return "online"


WRONG_CONTACT_EMAIL_MESSAGE = (
    "Contact email marked wrong — research a new address and update it before sending"
)

INVALID_CONTACT_EMAIL_MESSAGE = (
    "Contact email on file is not a valid address — fix it in Record Response before sending"
)


def contact_email_invalid(city: dict) -> bool:
    """True when a non-empty on-file email fails validation (e.g. nan, typo, missing @)."""
    raw = (city.get("contact_email") or "").strip()
    if not raw:
        return False
    return not is_valid_contact_email(raw)


def contact_email_marked_wrong(city: dict) -> bool:
    return bool(city.get("contact_email_wrong"))


def ensure_email_send_allowed(city: dict) -> None:
    """Hard stop for all outbound email when the on-file address is marked wrong or invalid."""
    if contact_email_marked_wrong(city):
        raise ValueError(WRONG_CONTACT_EMAIL_MESSAGE)
    if contact_email_invalid(city):
        raise ValueError(INVALID_CONTACT_EMAIL_MESSAGE)


def set_contact_email_wrong(city: dict, *, wrong: bool) -> None:
    if wrong:
        if not (city.get("contact_email") or "").strip():
            raise ValueError("Cannot mark wrong — no contact email on file")
        city["contact_email_wrong"] = True
        city["contact_email_wrong_at"] = datetime.now(timezone.utc).isoformat()
        return
    city.pop("contact_email_wrong", None)
    city.pop("contact_email_wrong_at", None)


def clear_contact_email_wrong(city: dict) -> None:
    city.pop("contact_email_wrong", None)
    city.pop("contact_email_wrong_at", None)


def is_portal_error(city: dict) -> bool:
    """True when the on-file portal URL is broken and excluded from monthly submit queue."""
    return bool(city.get("portal_error") or city.get("portal_on_hold"))


def set_portal_error(city: dict, *, notes: str = "") -> None:
    now = datetime.now(timezone.utc).isoformat()
    city["portal_error"] = True
    city["portal_error_at"] = now
    city["portal_error_url"] = (city.get("portal_url") or "").strip()
    cleaned = notes.strip()
    if cleaned:
        city["portal_error_notes"] = cleaned
    city.pop("portal_on_hold", None)


def clear_portal_error(city: dict) -> None:
    city.pop("portal_error", None)
    city.pop("portal_error_at", None)
    city.pop("portal_error_notes", None)
    city.pop("portal_error_url", None)
    city.pop("portal_on_hold", None)


def update_city_portal_url(city: dict, new_url: str, *, url_notes: str | None = None) -> str:
    """Update portal URL and refresh pathway when appropriate."""
    old = (city.get("portal_url") or "").strip()
    cleaned = new_url.strip()
    if not cleaned:
        raise ValueError("Portal URL is required")
    city["portal_url"] = cleaned
    if url_notes is not None:
        city["url_notes"] = url_notes.strip()
    if city.get("pathway") != "email_pdf":
        city["pathway"] = _pathway(cleaned, city.get("contact_email", ""))
    return old


def update_city_contact_email(city: dict, new_email: str) -> str:
    """Update a city's contact email and refresh pathway when appropriate."""
    old = (city.get("contact_email") or "").strip()
    cleaned = new_email.strip()
    if not cleaned:
        raise ValueError("Contact email is required")
    if not EMAIL_RE.fullmatch(cleaned):
        raise ValueError("Invalid email address")
    city["contact_email"] = cleaned
    clear_contact_email_wrong(city)
    if city.get("pathway") != "email_pdf":
        city["pathway"] = _pathway(city.get("portal_url", ""), cleaned)
    return old


def _record_score(record: dict) -> int:
    score = 0
    for key in ("portal_url", "contact_email", "url_notes"):
        if record.get(key):
            score += 1
    for req in record.get("requests", {}).values():
        if req.get("response_raw"):
            score += 2
        if req.get("requested") is not None:
            score += 1
    return score


def build_city_record(row: dict[str, Any]) -> dict:
    city = _clean_text(row.get(EXCEL_COLUMNS["city"]))
    state = normalize_state(row.get(EXCEL_COLUMNS["state"], ""))
    portal_url, contact_email, url_notes = extract_url_and_email(row.get(EXCEL_COLUMNS["url"]))

    water_requested = parse_yes_no(row.get(EXCEL_COLUMNS["water_requested"]))
    water_status, water_raw = normalize_water_response(row.get(EXCEL_COLUMNS["water_response"]))
    cv_requested = parse_yes_no(row.get(EXCEL_COLUMNS["cv_requested"]))
    cv_status, cv_raw = normalize_cv_response(row.get(EXCEL_COLUMNS["cv_response"]))

    return {
        "id": slugify(state, city),
        "city": city,
        "state": state,
        "pathway": _pathway(portal_url, contact_email),
        "portal_url": portal_url,
        "contact_email": contact_email,
        "url_notes": url_notes,
        "form_type": _clean_text(row.get(EXCEL_COLUMNS["form_type"])) or "Online",
        "requests": {
            "water_shutoff": {
                "requested": water_requested,
                "response_status": water_status,
                "response_raw": water_raw,
            },
            "code_violation": {
                "requested": cv_requested is True,
                "requested_at": "2026-06-08" if cv_requested is True else "",
                "response_status": cv_status,
                "response_raw": cv_raw,
            },
        },
        "submissions": [],
    }


def merge_duplicate_records(records: list[dict]) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for record in records:
        grouped.setdefault(record["id"], []).append(record)

    merged: list[dict] = []
    warnings: list[dict] = []

    for slug, group in grouped.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        group.sort(key=_record_score, reverse=True)
        base = dict(group[0])
        for other in group[1:]:
            for key in ("portal_url", "contact_email", "url_notes", "form_type"):
                if not base.get(key) and other.get(key):
                    base[key] = other[key]
            for req_key in ("water_shutoff", "code_violation"):
                for field in ("requested", "response_status", "response_raw", "requested_at"):
                    if not base["requests"][req_key].get(field) and other["requests"][req_key].get(field):
                        base["requests"][req_key][field] = other["requests"][req_key][field]

        base["pathway"] = _pathway(base.get("portal_url", ""), base.get("contact_email", ""))
        merged.append(base)
        warnings.append(
            {
                "type": "duplicate_merged",
                "id": slug,
                "city": base["city"],
                "state": base["state"],
                "row_count": len(group),
            }
        )

    merged.sort(key=lambda r: (r["state"], r["city"]))
    return merged, warnings


def merge_into_existing(existing: dict | None, incoming: dict) -> dict:
    if not existing:
        return incoming

    merged = dict(existing)
    for key in (
        "city",
        "state",
        "pathway",
        "portal_url",
        "contact_email",
        "url_notes",
        "form_type",
    ):
        if incoming.get(key):
            merged[key] = incoming[key]

    for req_key in ("water_shutoff", "code_violation"):
        existing_req = merged.get("requests", {}).get(req_key, {})
        incoming_req = incoming.get("requests", {}).get(req_key, {})
        merged_req = dict(existing_req)
        for field, value in incoming_req.items():
            if value is not None and value != "":
                merged_req[field] = value
        merged.setdefault("requests", {})[req_key] = merged_req

    if incoming.get("pdf"):
        merged["pdf"] = {**existing.get("pdf", {}), **incoming["pdf"]}

    merged.setdefault("submissions", existing.get("submissions") or incoming.get("submissions") or [])
    return merged


def build_pdf_city_record(item: dict) -> dict:
    return {
        "id": item["id"],
        "city": item["city"],
        "state": item["state"],
        "pathway": "email_pdf",
        "portal_url": item.get("url", ""),
        "contact_email": normalize_contact_email(item.get("email", "")),
        "url_notes": "",
        "form_type": "PDF Email",
        "requests": {
            "water_shutoff": {
                "requested": None,
                "response_status": "pending",
                "response_raw": "",
            },
            "code_violation": {
                "requested": None,
                "response_status": "pending",
                "response_raw": "",
            },
        },
        "pdf": {
            "status": item.get("status", "pending"),
            "raw_path": item.get("raw_path", ""),
            "user_filled_path": item.get("user_filled_path", ""),
            "preview_path": item.get("preview_path", ""),
            "fillable": item.get("fillable", False),
            "field_count": item.get("field_count", 0),
            "field_names": item.get("field_names", []),
            "saved_at": item.get("saved_at", ""),
            "desktop_path": item.get("desktop_path", ""),
        },
        "submissions": [],
    }


def merge_pdf_item_into_city(existing: dict | None, item: dict) -> dict:
    incoming = build_pdf_city_record(item)
    if not existing:
        return incoming

    merged = merge_into_existing(existing, incoming)
    merged["pdf"] = incoming["pdf"]
    if existing.get("pathway") == "online" and incoming.get("contact_email"):
        merged["pathway"] = "hybrid"
    elif existing.get("pathway") != "online":
        merged["pathway"] = "email_pdf"
    if incoming.get("contact_email") and not merged.get("contact_email"):
        merged["contact_email"] = incoming["contact_email"]
    if incoming.get("portal_url") and not merged.get("portal_url"):
        merged["portal_url"] = incoming["portal_url"]
    return merged


def merge_pdf_queue_into_registry(registry: dict | None = None, queue: dict | None = None) -> dict:
    import json

    data = registry if registry is not None else load_registry()
    if queue is None:
        queue_path = ROOT / "data" / "review-queue.json"
        queue = json.loads(queue_path.read_text(encoding="utf-8"))

    by_id = city_index(data)
    warnings: list[dict] = []
    added = 0
    updated = 0

    for item in queue.get("items", []):
        if item.get("state") in EXCLUDED_STATES or item.get("state") in LEADS_UNAVAILABLE_STATES:
            continue
        city_id = item["id"]
        existing = by_id.get(city_id)
        merged = merge_pdf_item_into_city(existing, item)
        if existing:
            updated += 1
        else:
            added += 1
        by_id[city_id] = merged

    cities = sorted(by_id.values(), key=lambda c: (c["state"], c["city"]))
    data["cities"] = cities
    data["city_count"] = len(cities)
    data["pdf_merged_at"] = datetime.now(timezone.utc).isoformat()
    data["pdf_queue_stats"] = queue.get("stats", {})
    warnings.append({"type": "pdf_merge", "added": added, "updated": updated, "total_pdf": len(queue.get("items", []))})
    data.setdefault("warnings", [])
    data["warnings"] = [w for w in data["warnings"] if w.get("type") != "pdf_merge"] + [warnings[-1]]
    return data


DISPLAY_STATUS_MAP = {
    "yes": "Yes",
    "no": "No",
    "pending": "",
    "wont_give": "WONT GIVE",
    "not_available": "Does not have",
    "redirect": "Redirect",
    "unknown": "Unknown",
    "denied": "Denied",
    "gave_other_info": "Gave Other Info",
    "approved_bad_data": "Replied — Info Invalid to Use",
    "approved_parcels": "Approved (Parcels)",
    "request_from_pd": "Request from PD",
    "they_charge": "They Charge",
    "specific_address_only": "Specifc Address Only",
}


def _bool_to_excel(value: Any) -> str:
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return ""


def _status_to_excel(status: str, raw: str) -> str:
    if raw:
        return raw
    if not status or status == "pending":
        return ""
    return DISPLAY_STATUS_MAP.get(status, status.replace("_", " ").title())


def _url_for_export(city: dict) -> str:
    if city.get("portal_url"):
        text = city["portal_url"]
        if city.get("url_notes"):
            text = f"{city['url_notes']} {text}".strip()
        return text
    return city.get("contact_email", "")


def export_registry_to_rows(registry: dict | None = None) -> list[dict[str, Any]]:
    data = registry if registry is not None else load_registry()
    rows: list[dict[str, Any]] = []
    for city in data.get("cities", []):
        water = city.get("requests", {}).get("water_shutoff", {})
        cv = city.get("requests", {}).get("code_violation", {})
        summary = city.get("submissions") or []
        submitted = [s for s in summary if s.get("action") == "submitted"]
        last = submitted[0] if submitted else {}
        pdf = city.get("pdf") or {}
        rows.append(
            {
                "City": city["city"],
                "State": city["state"],
                "Pathway": city.get("pathway", ""),
                "Water Shut Off Requested?": _bool_to_excel(water.get("requested")),
                "Did they send back water shut offs yet?": _status_to_excel(
                    water.get("response_status", ""), water.get("response_raw", "")
                ),
                "URL": _url_for_export(city),
                "Code Violation Requested on Jun 8th 2026?": _bool_to_excel(cv.get("requested")),
                "CV Sent Back fomr the June 8th 2026 request?": _status_to_excel(
                    cv.get("response_status", ""), cv.get("response_raw", "")
                ),
                "Form Type": city.get("form_type", ""),
                "PDF Status": pdf.get("status", ""),
                "Submission Count": len(summary),
                "Last Submitted At": last.get("logged_at", ""),
                "Last Channel": last.get("channel", ""),
            }
        )
    return rows


def build_registry_payload(
    cities: list[dict],
    *,
    source_file: str,
    source_rows: int,
    warnings: list[dict],
    existing: dict | None = None,
) -> dict:
    merged_cities: list[dict] = []
    by_id = {c["id"]: c for c in existing.get("cities", [])} if existing else {}

    for city in cities:
        if city.get("state") in EXCLUDED_STATES or city.get("state") in LEADS_UNAVAILABLE_STATES:
            continue
        prior = by_id.get(city["id"])
        merged_cities.append(merge_into_existing(prior, city))

    now = datetime.now(timezone.utc).isoformat()
    return {
        "version": 1,
        "imported_at": now,
        "source_file": source_file,
        "source_rows": source_rows,
        "city_count": len(merged_cities),
        "warnings": warnings,
        "cities": sorted(merged_cities, key=lambda c: (c["state"], c["city"])),
    }


def load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {
            "version": 1,
            "imported_at": "",
            "source_file": "",
            "source_rows": 0,
            "city_count": 0,
            "warnings": [],
            "cities": [],
        }
    import json

    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    blocked = EXCLUDED_STATES | LEADS_UNAVAILABLE_STATES
    cities = [
        c
        for c in data.get("cities", [])
        if c.get("state") not in blocked
        or c.get("pathway") == "email_only"
        or c.get("email_only_source")
    ]
    if len(cities) != len(data.get("cities", [])):
        data = dict(data)
        data["cities"] = cities
        data["city_count"] = len(cities)
    return data


def save_registry(data: dict) -> None:
    from review_portal.data_guard import write_json_atomic

    write_json_atomic(REGISTRY_PATH, data)


def find_city(registry: dict, city_id: str) -> dict | None:
    return city_index(registry).get(city_id)


def city_has_completed_pdf(city: dict) -> bool:
    pdf = city.get("pdf") or {}
    return pdf.get("status") == "completed" and bool(pdf.get("user_filled_path"))


def include_in_city_tracker(city: dict) -> bool:
    """Portal cities plus PDF-email cities only when a filled PDF exists on disk."""
    if city_has_completed_pdf(city):
        return True
    pathway = city.get("pathway", "online")
    if pathway == "email_pdf":
        return False
    if pathway in {"online", "hybrid", "email_only"}:
        return True
    return bool(city.get("portal_url"))


def list_city_tracker_cities(registry: dict | None = None) -> list[dict]:
    data = registry if registry is not None else load_registry()
    return [city for city in data.get("cities", []) if include_in_city_tracker(city)]


def city_index(registry: dict) -> dict[str, dict]:
    return {city["id"]: city for city in registry.get("cities", [])}


def build_import_report(registry: dict, extra_warnings: list[dict] | None = None) -> dict:
    warnings = list(registry.get("warnings", []))
    if extra_warnings:
        warnings.extend(extra_warnings)

    missing_url = [c["id"] for c in registry["cities"] if not c.get("portal_url") and not c.get("contact_email")]
    url_notes = [c["id"] for c in registry["cities"] if c.get("url_notes")]

    if missing_url:
        warnings.append({"type": "missing_url", "count": len(missing_url), "ids": missing_url[:20]})
    if url_notes:
        warnings.append({"type": "url_notes", "count": len(url_notes), "ids": url_notes[:20]})

    return {
        "imported_at": registry["imported_at"],
        "source_file": registry["source_file"],
        "source_rows": registry["source_rows"],
        "city_count": registry["city_count"],
        "warning_count": len(warnings),
        "warnings": warnings,
    }