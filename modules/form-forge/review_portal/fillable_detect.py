from __future__ import annotations

import re
from pathlib import Path

import fitz

from review_portal.office_use_boundary import office_use_boundaries, widget_is_off_limits
from review_portal.settings import load_settings

FIELD_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("name", ("name", "requestor", "requester", "applicant", "printed")),
    ("email", ("email", "e-mail", "mail")),
    ("phone", ("phone", "telephone", "tel", "fax")),
    ("street", ("address", "street", "mailing")),
    ("city", ("city", "municipality")),
    ("state", ("state",)),
    ("zip", ("zip", "postal")),
    ("date", ("date", "today")),
    ("request_text", ("description", "request", "records", "information", "purpose", "document")),
    ("reason", ("reason", "purpose")),
    ("signature", ("signature", "sign")),
]


def _match_kind(field_name: str) -> str | None:
    lower = field_name.lower()
    best: str | None = None
    best_len = 0
    for kind, hints in FIELD_HINTS:
        for hint in hints:
            if re.search(rf"(?<![a-z]){re.escape(hint)}(?![a-z])", lower):
                if len(hint) > best_len:
                    best = kind
                    best_len = len(hint)
    return best


def _value_for(kind: str, settings: dict) -> str:
    if kind == "name":
        return settings.get("name", "")
    if kind == "email":
        return settings.get("email", "")
    if kind == "phone":
        return settings.get("phone", "")
    if kind == "street":
        return settings.get("street", "")
    if kind == "city":
        return settings.get("city", "")
    if kind == "state":
        return settings.get("state", "")
    if kind == "zip":
        return settings.get("zip", "")
    if kind == "date":
        from datetime import datetime

        return datetime.now().strftime("%m/%d/%Y")
    if kind == "request_text":
        return settings.get("request_text", "")
    if kind == "reason":
        return settings.get("reason", "")
    if kind == "signature":
        return settings.get("signature_name") or settings.get("name", "")
    return ""


def suggest_elements(pdf_path: Path) -> list[dict]:
    """Read fillable PDF widget positions and return editor element payloads with Your Info."""
    settings = load_settings()
    doc = fitz.open(str(pdf_path))
    elements: list[dict] = []
    boundaries = office_use_boundaries(pdf_path)

    for page_idx, page in enumerate(doc):
        for widget in page.widgets():
            field_name = widget.field_name or ""
            kind = _match_kind(field_name)
            if not kind:
                continue
            rect = widget.rect
            if rect.width < 2 or rect.height < 2:
                continue
            if widget_is_off_limits(field_name, page_idx, rect.y0, boundaries):
                continue

            if kind == "signature":
                elements.append(
                    {
                        "type": "signature",
                        "page": page_idx,
                        "x": rect.x0,
                        "y": rect.y0,
                        "y_mode": "top",
                        "text": _value_for(kind, settings),
                        "fontsize": 10,
                        "label": "Signature",
                        "width": min(rect.width, 180),
                        "height": min(rect.height, 40),
                    }
                )
            elif widget.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                elements.append(
                    {
                        "type": "checkbox",
                        "page": page_idx,
                        "x": rect.x0,
                        "y": rect.y0,
                        "y_mode": "top",
                        "text": "",
                        "fontsize": 10,
                        "label": "Check",
                        "checked": True,
                        "box_size": max(30, min(rect.width, rect.height)),
                    }
                )
            else:
                val = _value_for(kind, settings)
                if not val:
                    continue
                elements.append(
                    {
                        "type": "date" if kind == "date" else "text",
                        "page": page_idx,
                        "x": rect.x0,
                        "y": rect.y0 + 1,
                        "y_mode": "top",
                        "text": val,
                        "fontsize": max(10, min(11, rect.height * 0.65))
                        if kind == "request_text"
                        else max(7, min(11, rect.height * 0.65)),
                        "label": "Request" if kind == "request_text" else kind.replace("_", " ").title(),
                        "box_width": rect.width,
                        "box_height": rect.height,
                    }
                )

    doc.close()
    return elements