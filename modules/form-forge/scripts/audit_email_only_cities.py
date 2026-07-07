"""Audit email-only cities and optionally backfill recent sends."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import load_registry, save_registry
from review_portal.submission_tracker import audit_email_only_cities, backfill_email_only_submission


def migrate_email_only_pathways(registry: dict) -> int:
    from review_portal.email_only import is_email_only_city

    changed = 0
    for city in registry.get("cities", []):
        if is_email_only_city(city):
            if city.get("pathway") != "email_only":
                city["pathway"] = "email_only"
                city["form_type"] = "Email Only"
                changed += 1
            continue
        if city.get("pathway") == "email_only" and (city.get("portal_url") or "").strip():
            city["pathway"] = "hybrid"
            if city.get("form_type") == "Email Only":
                city["form_type"] = "Online"
            changed += 1
    if changed:
        save_registry(registry)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit email-only cities in City Tracker")
    parser.add_argument("--days", type=int, default=2, help="Lookback window for recent sends")
    parser.add_argument("--migrate-pathways", action="store_true", help="Set pathway=email_only on eligible cities")
    parser.add_argument("--backfill", action="store_true", help="Backfill cities flagged needs_backfill")
    args = parser.parse_args()

    registry = load_registry()
    if args.migrate_pathways:
        n = migrate_email_only_pathways(registry)
        print(f"Migrated {n} cities to pathway=email_only")

    report = audit_email_only_cities(registry=registry, lookback_days=args.days)
    print(json.dumps(report, indent=2))

    if args.backfill:
        for row in report.get("needs_backfill", []):
            logged_at = row.get("recent_logged_at", "")
            if not logged_at:
                continue
            event = backfill_email_only_submission(
                row["id"],
                logged_at,
                notes="Backfilled from audit_email_only_cities.py",
            )
            print(f"Backfilled {row['id']} at {logged_at} -> {event['event_id']}")


if __name__ == "__main__":
    main()