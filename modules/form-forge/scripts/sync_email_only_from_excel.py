"""Sync email-only cities from Excel into portal-registry.json.

Scans the URL column plus every other column for contact emails when a city has
no online portal URL — the pattern used for plain-email FOIA requests.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.email_only import is_email_only_city
from review_portal.portal_registry import (
    DEFAULT_EXCEL,
    EXCEL_COLUMNS,
    _pathway,
    extract_url_and_email,
    load_registry,
    normalize_contact_email,
    normalize_state,
    save_registry,
    slugify,
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _emails_in_text(text: str) -> list[str]:
    found: list[str] = []
    for match in EMAIL_RE.findall(text or ""):
        cleaned = normalize_contact_email(match)
        if cleaned and cleaned not in found:
            found.append(cleaned)
    return found


def _row_emails(row: pd.Series, columns: list[str]) -> list[str]:
    emails: list[str] = []
    for col in columns:
        for email in _emails_in_text(str(row.get(col) or "")):
            if email not in emails:
                emails.append(email)
    return emails


def sync_email_only_from_excel(*, excel_path: Path = DEFAULT_EXCEL, dry_run: bool = False) -> dict:
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel not found: {excel_path}")

    df = pd.read_excel(excel_path)
    registry = load_registry()
    by_id = {city["id"]: city for city in registry.get("cities", [])}

    updated_email: list[str] = []
    migrated_pathway: list[str] = []
    email_only_ids: list[str] = []

    for _, row in df.iterrows():
        state = normalize_state(row.get(EXCEL_COLUMNS["state"]))
        city_name = str(row.get(EXCEL_COLUMNS["city"]) or "").strip()
        if not city_name:
            continue
        city_id = slugify(state, city_name)
        reg_city = by_id.get(city_id)
        if not reg_city:
            continue

        portal_url, url_email, notes = extract_url_and_email(row.get(EXCEL_COLUMNS["url"]))
        row_emails = _row_emails(row, list(df.columns))
        chosen_email = url_email or (row_emails[0] if row_emails else "")

        if not portal_url and chosen_email:
            email_only_ids.append(city_id)
            current_email = normalize_contact_email(reg_city.get("contact_email"))
            if chosen_email and chosen_email != current_email:
                if not dry_run:
                    reg_city["contact_email"] = chosen_email
                updated_email.append(city_id)
            if reg_city.get("pathway") != "email_only":
                migrated_pathway.append(city_id)
            if not dry_run:
                reg_city["portal_url"] = ""
                if notes and not (reg_city.get("url_notes") or "").strip():
                    reg_city["url_notes"] = notes
                if reg_city.get("pathway") != "email_pdf":
                    reg_city["pathway"] = _pathway("", chosen_email)
                    reg_city["form_type"] = "Email Only"

    if not dry_run:
        for city in registry.get("cities", []):
            if is_email_only_city(city):
                if city.get("pathway") != "email_only":
                    city["pathway"] = "email_only"
                    city["form_type"] = "Email Only"
                    migrated_pathway.append(city["id"])
        save_registry(registry)

    return {
        "excel_rows": len(df),
        "email_only_from_excel": len(email_only_ids),
        "email_only_ids": sorted(email_only_ids),
        "updated_contact_email": sorted(set(updated_email)),
        "migrated_pathway": sorted(set(migrated_pathway)),
        "dry_run": dry_run,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync email-only cities from Excel into registry")
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = sync_email_only_from_excel(excel_path=args.excel, dry_run=args.dry_run)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())