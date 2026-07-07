"""Import Online City Portal Forms.xlsx into data/portal-registry.json."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.data_guard import write_json_atomic
from review_portal.portal_registry import (
    DEFAULT_EXCEL,
    EXCEL_COLUMNS,
    REGISTRY_PATH,
    REPORT_PATH,
    build_city_record,
    build_import_report,
    build_registry_payload,
    merge_duplicate_records,
)


def _load_existing_registry() -> dict | None:
    if not REGISTRY_PATH.exists():
        return None
    import json

    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def import_from_excel(excel_path: Path, *, dry_run: bool = False) -> dict:
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel file not found: {excel_path}")

    frame = pd.read_excel(excel_path)
    missing = [name for name in EXCEL_COLUMNS.values() if name not in frame.columns]
    if missing:
        raise ValueError(f"Excel missing expected columns: {missing}")

    records = [build_city_record(row) for row in frame.to_dict(orient="records")]
    cities, dup_warnings = merge_duplicate_records(records)
    existing = _load_existing_registry()
    registry = build_registry_payload(
        cities,
        source_file=str(excel_path),
        source_rows=len(frame),
        warnings=dup_warnings,
        existing=existing,
    )
    report = build_import_report(registry)

    if dry_run:
        return {"registry": registry, "report": report, "dry_run": True}

    write_json_atomic(REGISTRY_PATH, registry)
    write_json_atomic(REPORT_PATH, report)
    return {"registry": registry, "report": report, "dry_run": False}


def _print_summary(result: dict) -> None:
    registry = result["registry"]
    report = result["report"]
    warning_types: dict[str, int] = {}
    for warning in report["warnings"]:
        warning_types[warning["type"]] = warning_types.get(warning["type"], 0) + 1

    print(f"Imported {registry['city_count']} cities from {registry['source_rows']} rows")
    if warning_types:
        parts = [f"{count} {name}" for name, count in sorted(warning_types.items())]
        print(f"Warnings: {', '.join(parts)}")
    else:
        print("Warnings: none")

    if result["dry_run"]:
        print("Dry run — no files written")
    else:
        print(f"Wrote {REGISTRY_PATH.relative_to(ROOT)}")
        print(f"Wrote {REPORT_PATH.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import portal city registry from Excel")
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL, help="Path to source Excel file")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing JSON")
    args = parser.parse_args()

    result = import_from_excel(args.excel, dry_run=args.dry_run)
    _print_summary(result)


if __name__ == "__main__":
    main()