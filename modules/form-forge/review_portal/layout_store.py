from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import fitz

from review_portal.data_guard import version_before_overwrite, write_json_atomic
from review_portal.pdf_save import _normalize_signature_size

ROOT = Path(__file__).resolve().parents[1]
LAYOUTS_PATH = ROOT / "data" / "form-layouts"
_DEFAULT_PAGE = fitz.Rect(0, 0, 612, 792)


def layout_path(form_id: str) -> Path:
    return LAYOUTS_PATH / f"{form_id}.json"


def _sanitize_elements(elements: list[dict]) -> list[dict]:
    cleaned: list[dict] = []
    for el in elements:
        item = dict(el)
        if item.get("type") == "signature":
            w, h = _normalize_signature_size(
                item.get("width", 130),
                item.get("height", 28),
                _DEFAULT_PAGE,
            )
            item["width"] = w
            item["height"] = h
        cleaned.append(item)
    return cleaned


def save_layout(form_id: str, elements: list[dict]) -> None:
    LAYOUTS_PATH.mkdir(parents=True, exist_ok=True)
    payload = {
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "elements": _sanitize_elements(elements),
    }
    path = layout_path(form_id)
    version_before_overwrite(path, "form-layouts")
    write_json_atomic(path, payload)


def load_layout(form_id: str) -> dict | None:
    path = layout_path(form_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None