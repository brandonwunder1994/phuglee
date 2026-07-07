"""Update date fields on a saved PDF to today's date before emailing."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import fitz

from review_portal.fillable_detect import _match_kind, _value_for
from review_portal.layout_store import load_layout
from review_portal.pdf_save import save_elements_pdf
from review_portal.settings import load_settings

ROOT = Path(__file__).resolve().parents[1]


def today_str() -> str:
    return datetime.now().strftime("%m/%d/%Y")


def _is_date_element(el: dict) -> bool:
    return el.get("type") == "date" or str(el.get("label", "")).lower() == "date"


def _update_layout_dates(elements: list[dict]) -> list[dict]:
    today = today_str()
    updated: list[dict] = []
    for el in elements:
        item = dict(el)
        if _is_date_element(item):
            item["text"] = today
        updated.append(item)
    return updated


def _fillable_dates_current(pdf_path: Path) -> bool:
    settings = load_settings()
    expected = _value_for("date", settings)
    doc = fitz.open(str(pdf_path))
    found_date = False
    try:
        for page in doc:
            for widget in page.widgets():
                field_name = widget.field_name or ""
                if _match_kind(field_name) != "date":
                    continue
                found_date = True
                if (widget.field_value or "").strip() != expected:
                    return False
        return found_date
    finally:
        doc.close()


def _update_fillable_dates(pdf_path: Path, dest_path: Path) -> bool:
    if pdf_path == dest_path and _fillable_dates_current(pdf_path):
        return True

    settings = load_settings()
    doc = fitz.open(str(pdf_path))
    changed = False
    for page in doc:
        for widget in page.widgets():
            field_name = widget.field_name or ""
            if _match_kind(field_name) != "date":
                continue
            widget.field_value = _value_for("date", settings)
            widget.update()
            changed = True
    if not changed:
        doc.close()
        return False
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(dest_path), deflate=True, garbage=4)
    doc.close()
    return True


def refresh_pdf_dates(
    form_id: str,
    *,
    raw_path: Path | None = None,
    filled_path: Path | None = None,
) -> Path:
    """Return path to PDF with date fields set to today. Overwrites filled PDF when possible."""
    if filled_path is None:
        raise FileNotFoundError("filled PDF path is required")

    layout = load_layout(form_id)
    if layout and layout.get("elements"):
        if raw_path is None or not raw_path.exists():
            raise FileNotFoundError("raw PDF required to refresh dates from saved layout")
        today = today_str()
        if all(
            not _is_date_element(el) or str(el.get("text", "")).strip() == today
            for el in layout["elements"]
        ):
            return filled_path
        elements = _update_layout_dates(layout["elements"])
        save_elements_pdf(raw_path, filled_path, elements)
        return filled_path

    if _update_fillable_dates(filled_path, filled_path):
        return filled_path

    raise ValueError(
        "No date layout found for this form. Open it in the editor, place the Date field, and save once."
    )