"""
Merge government-list PDF cities into Form Forge (registry + review-queue).

Railway keeps portal-registry / review-queue on a volume that only seeds when
empty. This module is idempotent and safe to run on every Form Forge boot:
missing email_pdf cities from the seed are added; existing cities (especially
completed fills) are never overwritten.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from review_portal.portal_registry import (
    EXCLUDED_STATES,
    LEADS_UNAVAILABLE_STATES,
    REGISTRY_PATH,
    load_registry,
    save_registry,
)

ROOT = Path(__file__).resolve().parents[1]
SEED_PATH = ROOT / "data" / "govlist-pdf-promote-seed.json"
QUEUE_PATH = ROOT / "data" / "review-queue.json"
MARKER_PATH = ROOT / "data" / "govlist-pdf-promote-applied.json"

BLOCKED_STATES = EXCLUDED_STATES | LEADS_UNAVAILABLE_STATES


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict) -> None:
    from review_portal.data_guard import write_json_atomic

    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_atomic(path, data)


def load_seed(path: Path | None = None) -> dict:
    seed_file = path or SEED_PATH
    if not seed_file.exists():
        return {"version": 1, "cities": []}
    raw = json.loads(seed_file.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {"version": 1, "cities": []}
    cities = raw.get("cities")
    if not isinstance(cities, list):
        raw["cities"] = []
    return raw


def build_registry_city(item: dict) -> dict:
    """Shape a seed row into a portal-registry email_pdf city."""
    city = str(item.get("city") or "").strip()
    state = str(item.get("state") or "").strip()
    city_id = str(item.get("id") or "").strip()
    url = str(item.get("url") or item.get("portal_url") or "").strip()
    email = str(item.get("contact_email") or item.get("email") or "").strip()
    source_id = str(item.get("sourceId") or item.get("govListSourceId") or "").strip()

    return {
        "id": city_id,
        "city": city,
        "state": state,
        "pathway": "email_pdf",
        "portal_url": url,
        "contact_email": email,
        "url_notes": "Promoted from Government Lists (PDF FOIA form).",
        "form_type": "PDF Email",
        "gov_list_source_id": source_id,
        "promoted_from_govlist_at": item.get("promotedAt") or _now_iso(),
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
            "status": "missing_pdf" if not item.get("raw_path") else "pending",
            "raw_path": str(item.get("raw_path") or ""),
            "user_filled_path": "",
            "preview_path": str(item.get("preview_path") or ""),
            "fillable": bool(item.get("fillable", False)),
            "field_count": int(item.get("field_count") or 0),
            "field_names": list(item.get("field_names") or []),
            "saved_at": "",
            "desktop_path": "",
        },
        "submissions": [],
    }


def build_queue_item(item: dict) -> dict:
    """Shape a seed row into a review-queue editor item."""
    city = str(item.get("city") or "").strip()
    state = str(item.get("state") or "").strip()
    city_id = str(item.get("id") or "").strip()
    url = str(item.get("url") or item.get("portal_url") or "").strip()
    email = str(item.get("contact_email") or item.get("email") or "").strip()
    raw_path = str(item.get("raw_path") or "")
    status = "pending" if raw_path else "missing_pdf"

    return {
        "id": city_id,
        "state": state,
        "city": city,
        "email": email,
        "raw_path": raw_path,
        "user_filled_path": "",
        "preview_path": str(item.get("preview_path") or ""),
        "fillable": bool(item.get("fillable", False)),
        "field_count": int(item.get("field_count") or 0),
        "field_names": list(item.get("field_names") or []),
        "status": status,
        "url": url,
        "saved_at": "",
        "desktop_path": "",
        "gov_list_source_id": str(item.get("sourceId") or item.get("govListSourceId") or ""),
        "promoted_from_govlist_at": item.get("promotedAt") or _now_iso(),
    }


def _eligible_seed_cities(seed: dict) -> list[dict]:
    out: list[dict] = []
    for raw in seed.get("cities") or []:
        if not isinstance(raw, dict):
            continue
        city_id = str(raw.get("id") or "").strip()
        city = str(raw.get("city") or "").strip()
        state = str(raw.get("state") or "").strip()
        if not city_id or not city or not state:
            continue
        if state in BLOCKED_STATES:
            continue
        out.append(raw)
    return out


def merge_seed_into_registry(registry: dict, seed_cities: list[dict]) -> tuple[dict, int]:
    by_id = {c["id"]: c for c in registry.get("cities") or [] if c.get("id")}
    added = 0
    for item in seed_cities:
        city_id = str(item.get("id") or "").strip()
        if not city_id or city_id in by_id:
            continue
        by_id[city_id] = build_registry_city(item)
        added += 1
    cities = sorted(by_id.values(), key=lambda c: (c.get("state", ""), c.get("city", "")))
    next_reg = dict(registry)
    next_reg["cities"] = cities
    next_reg["city_count"] = len(cities)
    if added:
        next_reg["govlist_pdf_promoted_at"] = _now_iso()
    return next_reg, added


def merge_seed_into_queue(queue: dict, seed_cities: list[dict]) -> tuple[dict, int]:
    items = list(queue.get("items") or [])
    by_id = {str(i.get("id")): i for i in items if i.get("id")}
    added = 0
    for item in seed_cities:
        city_id = str(item.get("id") or "").strip()
        if not city_id or city_id in by_id:
            continue
        by_id[city_id] = build_queue_item(item)
        added += 1
    next_items = sorted(by_id.values(), key=lambda i: (i.get("state", ""), i.get("city", "")))
    completed = sum(1 for i in next_items if i.get("status") == "completed")
    pending = sum(1 for i in next_items if i.get("status") == "pending")
    missing = sum(1 for i in next_items if i.get("status") == "missing_pdf")
    next_queue = dict(queue) if queue else {}
    next_queue["mode"] = next_queue.get("mode") or "raw_editor"
    next_queue["generated_at"] = next_queue.get("generated_at") or _now_iso()
    next_queue["total"] = len(next_items)
    next_queue["items"] = next_items
    next_queue["stats"] = {
        **(next_queue.get("stats") or {}),
        "total": len(next_items),
        "completed": completed,
        "pending": pending,
        "missing_pdf": missing,
    }
    if added:
        next_queue["govlist_pdf_promoted_at"] = _now_iso()
    return next_queue, added


def apply_govlist_pdf_promote(
    *,
    seed_path: Path | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """
    Idempotent merge of seed cities into registry + review-queue.

    Returns stats. Safe on every boot. Existing city ids are never replaced.
    """
    seed = load_seed(seed_path)
    seed_cities = _eligible_seed_cities(seed)
    if not seed_cities:
        return {
            "ok": True,
            "skipped": True,
            "reason": "empty_seed",
            "seed_count": 0,
            "registry_added": 0,
            "queue_added": 0,
        }

    # Fast path: marker matches seed version/count and force is false.
    marker = _load_json(MARKER_PATH) if MARKER_PATH.exists() else {}
    seed_version = str(seed.get("version") or "1")
    seed_count = len(seed_cities)
    if (
        not force
        and marker.get("seed_version") == seed_version
        and int(marker.get("seed_count") or 0) == seed_count
        and marker.get("complete") is True
    ):
        # Still re-check registry in case volume was restored from older backup.
        registry = load_registry()
        existing = {c.get("id") for c in registry.get("cities") or []}
        missing = [c for c in seed_cities if c.get("id") not in existing]
        if not missing:
            return {
                "ok": True,
                "skipped": True,
                "reason": "already_applied",
                "seed_count": seed_count,
                "registry_added": 0,
                "queue_added": 0,
            }

    registry = load_registry()
    # load_registry filters blocked states from the in-memory view; merge against
    # the on-disk file so we do not drop volume cities that were filtered.
    disk = _load_json(REGISTRY_PATH) if REGISTRY_PATH.exists() else dict(registry)
    if not disk.get("cities"):
        disk = dict(registry)

    next_reg, reg_added = merge_seed_into_registry(disk, seed_cities)
    if reg_added:
        save_registry(next_reg)

    queue = _load_json(QUEUE_PATH) if QUEUE_PATH.exists() else {
        "mode": "raw_editor",
        "generated_at": _now_iso(),
        "total": 0,
        "stats": {},
        "items": [],
    }
    next_queue, queue_added = merge_seed_into_queue(queue, seed_cities)
    if queue_added:
        _write_json(QUEUE_PATH, next_queue)

    result = {
        "ok": True,
        "skipped": False,
        "seed_count": seed_count,
        "seed_version": seed_version,
        "registry_added": reg_added,
        "queue_added": queue_added,
        "registry_total": next_reg.get("city_count"),
        "queue_total": next_queue.get("total"),
        "applied_at": _now_iso(),
    }
    _write_json(
        MARKER_PATH,
        {
            "complete": True,
            "seed_version": seed_version,
            "seed_count": seed_count,
            "last": result,
        },
    )
    return result


def ensure_govlist_pdf_promote_on_boot() -> dict[str, Any]:
    """Called from Form Forge startup — never raises."""
    try:
        result = apply_govlist_pdf_promote()
        print(
            f"[govlist-pdf-promote] seed={result.get('seed_count')} "
            f"registry+={result.get('registry_added')} "
            f"queue+={result.get('queue_added')} "
            f"skipped={result.get('skipped')}"
        )
        return result
    except Exception as exc:  # pragma: no cover — boot must not die
        print(f"[govlist-pdf-promote] failed (non-fatal): {exc}")
        return {"ok": False, "error": str(exc)}
