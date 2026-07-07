"""Merge review-queue PDF cities into portal-registry.json."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import merge_pdf_queue_into_registry, save_registry


def main() -> None:
    registry = merge_pdf_queue_into_registry()
    save_registry(registry)
    warning = next((w for w in registry.get("warnings", []) if w.get("type") == "pdf_merge"), {})
    print(f"Registry now has {registry['city_count']} cities")
    print(f"PDF merge: {warning.get('added', 0)} added, {warning.get('updated', 0)} updated")


if __name__ == "__main__":
    main()