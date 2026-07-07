#!/usr/bin/env python3
"""Reset submission KPIs for a calendar month (default: current month)."""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.data_guard import create_full_snapshot
from review_portal.submission_tracker import build_submission_kpi, reset_monthly_submissions


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset Form Forge monthly submission KPIs")
    parser.add_argument(
        "--month",
        default=datetime.now(timezone.utc).strftime("%Y-%m"),
        help="Month to reset in YYYY-MM format (default: current month)",
    )
    parser.add_argument("--no-backup", action="store_true", help="Skip pre-reset snapshot")
    args = parser.parse_args()

    if not args.no_backup:
        snap = create_full_snapshot(label=f"pre-kpi-reset-{args.month}")
        print(f"Backup: {snap}")

    report = reset_monthly_submissions(args.month)
    kpi = build_submission_kpi()
    print(f"Reset {args.month}:")
    print(f"  removed log events: {report['removed_log_events']}")
    print(f"  removed city events: {report['removed_city_events']}")
    print(f"  cleared channel fields: {report['cleared_channel_fields']}")
    print(
        f"Current month KPI ({kpi['current_month_label']}): "
        f"{kpi['current_month_email_sent']} email, "
        f"{kpi['current_month_online_submitted']} online, "
        f"{kpi['current_month_total_submitted']} total"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())