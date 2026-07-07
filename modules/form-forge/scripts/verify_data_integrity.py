"""Verify completed form data is consistent across all storage locations."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.data_guard import verify_integrity


def main() -> None:
    report = verify_integrity()
    print("=== DATA INTEGRITY REPORT ===")
    for key, value in report.items():
        print(f"{key}: {value}")
    if report["ok"]:
        print("\nAll completed forms are accounted for.")
    else:
        print("\nISSUES FOUND — review the lists above.")
        sys.exit(1)


if __name__ == "__main__":
    main()