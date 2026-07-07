"""Scan Excel + registry for email-only candidates."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.email_only import is_email_only_city, city_lacks_portal_and_email
from review_portal.portal_registry import (
    DEFAULT_EXCEL,
    EXCEL_COLUMNS,
    city_has_completed_pdf,
    extract_url_and_email,
    load_registry,
    normalize_state,
    slugify,
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def main() -> int:
    excel = DEFAULT_EXCEL
    if not excel.exists():
        print(f"Excel not found: {excel}")
        return 1

    df = pd.read_excel(excel)
    registry = load_registry()
    by_id = {c["id"]: c for c in registry.get("cities", [])}

    print("=== Excel: extracted email, no portal ===")
    excel_email_only: list[tuple] = []
    for _, row in df.iterrows():
        portal, email, notes = extract_url_and_email(row.get(EXCEL_COLUMNS["url"]))
        state = normalize_state(row.get(EXCEL_COLUMNS["state"]))
        city = str(row.get(EXCEL_COLUMNS["city"]) or "").strip()
        if email and not portal:
            excel_email_only.append((state, city, email, notes))
            cid = slugify(state, city)
            reg = by_id.get(cid, {})
            print(
                f"  {state} | {city} | {email} | registry_pathway={reg.get('pathway', 'MISSING')} "
                f"| is_email_only={is_email_only_city(reg) if reg else 'n/a'}"
            )
    print(f"count: {len(excel_email_only)}\n")

    print("=== Excel: @ in URL cell but no extracted email ===")
    missed: list[tuple] = []
    for _, row in df.iterrows():
        raw = str(row.get(EXCEL_COLUMNS["url"]) or "").strip()
        if not raw or raw.lower() == "nan":
            continue
        portal, email, notes = extract_url_and_email(raw)
        if "@" in raw and not email:
            state = normalize_state(row.get(EXCEL_COLUMNS["state"]))
            city = str(row.get(EXCEL_COLUMNS["city"]) or "").strip()
            missed.append((state, city, raw))
            print(f"  {state} | {city} | {raw[:100]}")
    print(f"count: {len(missed)}\n")

    print("=== Excel: text-only URL (no portal, no email) ===")
    for _, row in df.iterrows():
        raw = str(row.get(EXCEL_COLUMNS["url"]) or "").strip()
        if not raw or raw.lower() == "nan":
            continue
        portal, email, notes = extract_url_and_email(raw)
        if not portal and not email:
            state = normalize_state(row.get(EXCEL_COLUMNS["state"]))
            city = str(row.get(EXCEL_COLUMNS["city"]) or "").strip()
            print(f"  {state} | {city} | {raw[:100]}")
    print()

    print("=== Registry: email + no portal + no PDF (any pathway except email_pdf) ===")
    candidates = []
    for c in registry.get("cities", []):
        email = (c.get("contact_email") or "").strip()
        portal = (c.get("portal_url") or "").strip()
        if email and not portal and not city_has_completed_pdf(c) and c.get("pathway") != "email_pdf":
            candidates.append(c)
    for c in sorted(candidates, key=lambda x: (x["state"], x["city"])):
        print(
            f"  {c['id']} | pathway={c.get('pathway')} | email={c.get('contact_email')} "
            f"| is_email_only={is_email_only_city(c)}"
        )
    print(f"count: {len(candidates)}\n")

    print("=== Registry: no portal or email ===")
    for c in sorted(
        [x for x in registry.get("cities", []) if city_lacks_portal_and_email(x)],
        key=lambda x: (x["state"], x["city"]),
    ):
        print(f"  {c['id']} | notes={c.get('url_notes', '')[:80]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())