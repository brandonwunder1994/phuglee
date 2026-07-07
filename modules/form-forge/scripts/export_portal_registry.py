"""Export portal-registry.json to Excel."""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import export_registry_to_rows, load_registry

DEFAULT_OUTPUT = Path(r"C:\Users\brand\Desktop\Online City Portal Forms - Export.xlsx")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export portal registry to Excel")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output xlsx path")
    args = parser.parse_args()

    registry = load_registry()
    rows = export_registry_to_rows(registry)
    frame = pd.DataFrame(rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_excel(args.output, index=False, sheet_name="Portal Registry")

    print(f"Exported {len(rows)} cities to {args.output}")
    print(f"Generated at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")


if __name__ == "__main__":
    main()