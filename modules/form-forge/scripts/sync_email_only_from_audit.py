"""Import email_only cities from CONTACT-EMAIL-AUDIT.xlsx into portal-registry."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from datetime import datetime, timezone

from review_portal.email_only import is_email_only_city
from review_portal.portal_registry import (
    find_city,
    load_registry,
    normalize_contact_email,
    normalize_state,
    save_registry,
    slugify,
)

AUDIT_PATH = ROOT / "data" / "CONTACT-EMAIL-AUDIT.xlsx"
LOG_PATH = ROOT / "data" / "email-only-audit-log.json"


def _clean_url(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.lower() == "nan":
        return ""
    return text


def _clean_note(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.lower() == "nan":
        return ""
    return text


def _build_audit_city_record(row: pd.Series) -> dict:
    state = normalize_state(row.get("State"))
    city_name = str(row.get("City") or "").strip()
    email = normalize_contact_email(row.get("Send To Email"))
    sheet_url = _clean_url(row.get("URL for Form"))
    notes = _clean_note(row.get("Contact Notes")) or _clean_note(row.get("Contact Raw (from your sheet)"))
    if sheet_url:
        ref = f"Reference: {sheet_url}"
        notes = f"{notes}\n{ref}".strip() if notes else ref

    return {
        "id": slugify(state, city_name),
        "city": city_name,
        "state": state,
        "pathway": "email_only",
        "portal_url": "",
        "contact_email": email,
        "url_notes": notes,
        "form_type": "Email Only",
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
            "status": "email_only",
            "raw_path": "",
            "user_filled_path": "",
            "preview_path": "",
            "fillable": False,
            "field_count": 0,
            "field_names": [],
        },
        "submissions": [],
        "email_only_source": "CONTACT-EMAIL-AUDIT.xlsx",
        "email_only_logged_at": datetime.now(timezone.utc).isoformat(),
        "email_only_was_sent": str(row.get("Was Sent") or "").strip(),
        "email_only_automation_status": str(row.get("Automation Status") or "").strip(),
    }


def _apply_email_only_audit(reg_city: dict, row: pd.Series) -> bool:
    sheet_email = normalize_contact_email(row.get("Send To Email"))
    sheet_url = _clean_url(row.get("URL for Form"))
    notes = _clean_note(row.get("Contact Notes")) or _clean_note(row.get("Contact Raw (from your sheet)"))
    changed = False

    if sheet_email and sheet_email != normalize_contact_email(reg_city.get("contact_email")):
        reg_city["contact_email"] = sheet_email
        changed = True

    if (reg_city.get("portal_url") or "").strip():
        reg_city["portal_url"] = ""
        changed = True

    merged_notes = (reg_city.get("url_notes") or "").strip()
    for piece in (notes, f"Reference: {sheet_url}" if sheet_url else ""):
        if piece and piece not in merged_notes:
            merged_notes = f"{merged_notes}\n{piece}".strip() if merged_notes else piece
            changed = True
    if merged_notes != (reg_city.get("url_notes") or "").strip():
        reg_city["url_notes"] = merged_notes

    if reg_city.get("pathway") != "email_only":
        reg_city["pathway"] = "email_only"
        changed = True
    if reg_city.get("form_type") != "Email Only":
        reg_city["form_type"] = "Email Only"
        changed = True

    pdf = dict(reg_city.get("pdf") or {})
    if pdf.get("status") == "completed":
        pass
    elif pdf.get("status") != "email_only":
        pdf.update(
            {
                "status": "email_only",
                "raw_path": "",
                "user_filled_path": "",
            }
        )
        reg_city["pdf"] = pdf
        changed = True

    reg_city["email_only_source"] = "CONTACT-EMAIL-AUDIT.xlsx"
    reg_city["email_only_logged_at"] = datetime.now(timezone.utc).isoformat()
    reg_city["email_only_was_sent"] = str(row.get("Was Sent") or "").strip()
    reg_city["email_only_automation_status"] = str(row.get("Automation Status") or "").strip()
    return changed


def sync_email_only_from_audit(*, dry_run: bool = False) -> dict:
    if not AUDIT_PATH.exists():
        raise FileNotFoundError(f"Audit sheet not found: {AUDIT_PATH}")

    df = pd.read_excel(AUDIT_PATH)
    rows = df[df["Pathway"].fillna("").astype(str).str.lower() == "email_only"]
    registry = load_registry()

    added: list[str] = []
    updated: list[str] = []
    already_ok: list[str] = []

    for _, row in rows.iterrows():
        city_id = slugify(normalize_state(row.get("State")), str(row.get("City") or "").strip())
        reg_city = find_city(registry, city_id)
        if not reg_city:
            added.append(city_id)
            if not dry_run:
                registry.setdefault("cities", []).append(_build_audit_city_record(row))
            continue

        changed = _apply_email_only_audit(reg_city, row) if not dry_run else _apply_email_only_audit(
            dict(reg_city), row
        )
        if changed:
            updated.append(city_id)
        elif is_email_only_city(reg_city):
            already_ok.append(city_id)

    if not dry_run:
        registry["cities"] = sorted(registry.get("cities", []), key=lambda c: (c["state"], c["city"]))
        registry["city_count"] = len(registry["cities"])
        save_registry(registry)
        LOG_PATH.write_text(
            json.dumps(
                {
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                    "source": str(AUDIT_PATH),
                    "email_only_rows": len(rows),
                    "added": added,
                    "updated": updated,
                    "already_ok": already_ok,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    return {
        "source": str(AUDIT_PATH),
        "email_only_rows": int(len(rows)),
        "added": sorted(added),
        "updated": sorted(updated),
        "already_ok": sorted(already_ok),
        "dry_run": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync email_only cities from CONTACT-EMAIL-AUDIT.xlsx")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = sync_email_only_from_audit(dry_run=args.dry_run)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())