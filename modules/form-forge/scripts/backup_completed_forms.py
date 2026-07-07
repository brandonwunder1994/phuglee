"""Create a full snapshot of all completed form data."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.data_guard import create_full_snapshot, seed_latest_mirror, verify_integrity


def main() -> None:
    report = verify_integrity()
    mirror = seed_latest_mirror()
    snap = create_full_snapshot(label="manual")
    print("=== FULL BACKUP SNAPSHOT ===")
    print(f"Snapshot: {snap}")
    print(f"PDFs: {report['pdf_count']}")
    print(f"Manifest entries: {report['manifest_count']}")
    print(f"Layouts: {report['layout_count']}")
    print(f"Latest mirror synced: {mirror['pdfs']} PDFs, {mirror['layouts']} layouts")
    if not report["ok"]:
        print("WARNING: integrity issues detected:")
        for key in ("missing_pdf_for_manifest", "orphan_pdfs", "missing_layout_for_manifest"):
            if report.get(key):
                print(f"  {key}: {report[key]}")


if __name__ == "__main__":
    main()