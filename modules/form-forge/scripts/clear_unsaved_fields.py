"""Remove field layouts and filled PDFs for forms not yet stamped/saved.

SAFETY: requires --confirm. Never deletes files protected by manifest, log, or desktop copy.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.data_guard import load_log_ids
from review_portal.save_tracker import desktop_path

MANIFEST_PATH = ROOT / "data" / "completed-forms-manifest.json"
LAYOUTS_DIR = ROOT / "data" / "form-layouts"
USER_FILLED = ROOT / "forms" / "user-filled"
QUEUE_PATH = ROOT / "data" / "review-queue.json"


def _protected_ids() -> set[str]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {}
    return set(manifest.keys()) | load_log_ids()


def _desktop_exists(form_id: str, queue_items: list[dict]) -> bool:
    item = next((i for i in queue_items if i["id"] == form_id), None)
    if not item:
        return False
    return desktop_path(item["state"], item["city"]).exists()


def main() -> None:
    if "--confirm" not in sys.argv:
        print("Refusing to run without --confirm (this script deletes files).")
        print("Usage: python scripts/clear_unsaved_fields.py --confirm")
        sys.exit(1)

    protected = _protected_ids()
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    queue_items = queue.get("items", [])
    pending_ids = {i["id"] for i in queue_items if i.get("status") == "pending"}

    removed_layouts: list[str] = []
    removed_pdfs: list[str] = []
    skipped: list[str] = []

    for layout_file in LAYOUTS_DIR.glob("*.json"):
        form_id = layout_file.stem
        if form_id in protected or _desktop_exists(form_id, queue_items):
            skipped.append(f"layout:{form_id}")
            continue
        layout_file.unlink()
        removed_layouts.append(form_id)

    for pdf in USER_FILLED.rglob("*.pdf"):
        form_id = pdf.stem
        if form_id in protected or _desktop_exists(form_id, queue_items):
            skipped.append(f"pdf:{form_id}")
            continue
        pdf.unlink()
        removed_pdfs.append(str(pdf.relative_to(ROOT)))

    print("=== CLEAR UNSAVED FIELD ARTIFACTS ===")
    print(f"Protected forms (never touched): {len(protected)}")
    print(f"Pending forms: {len(pending_ids)}")
    print(f"Skipped (protected): {len(skipped)}")
    print(f"Removed layout files: {len(removed_layouts)}")
    for name in removed_layouts:
        print(f"  - {name}.json")
    print(f"Removed user-filled PDFs: {len(removed_pdfs)}")
    for path in removed_pdfs:
        print(f"  - {path}")
    if not removed_layouts and not removed_pdfs:
        print("No unsafe artifacts found — all clean.")


if __name__ == "__main__":
    main()