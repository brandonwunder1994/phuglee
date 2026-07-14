"""Apply user contact settings to all city PDFs on file."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import fitz

from review_portal.fillable_detect import suggest_elements
from review_portal.layout_store import load_layout, save_layout
from review_portal.pdf_save import save_elements_pdf
from review_portal.save_tracker import filled_path, record_save
from review_portal.settings import load_settings

ROOT = Path(__file__).resolve().parents[1]
CONTACT_LABELS = frozenset({"name", "phone", "email", "signature"})


def _value_for_label(label: str, settings: dict) -> str | None:
    key = label.strip().lower()
    city_state_zip = ", ".join(
        part
        for part in [
            settings.get("city", ""),
            f"{settings.get('state', '')} {settings.get('zip', '')}".strip(),
        ]
        if part
    )
    mapping = {
        "name": settings.get("name", ""),
        "phone": settings.get("phone", ""),
        "email": settings.get("email", ""),
        "street": settings.get("street", ""),
        "street address": settings.get("street", ""),
        "city": settings.get("city", ""),
        "state": settings.get("state", ""),
        "zip": settings.get("zip", ""),
        "full address": settings.get("full_address", ""),
        "city, state zip": city_state_zip,
        "signature": settings.get("signature_name") or settings.get("name", ""),
        "date": datetime.now().strftime("%m/%d/%Y"),
    }
    if key not in mapping:
        return None
    return mapping[key]


def _update_layout_elements(elements: list[dict], settings: dict) -> list[dict]:
    updated: list[dict] = []
    for el in elements:
        item = dict(el)
        label = str(item.get("label", ""))
        val = _value_for_label(label, settings)
        if val is None:
            updated.append(item)
            continue
        if item.get("type") == "signature" or label.strip().lower() == "signature":
            item["text"] = settings.get("signature_name") or settings.get("name", "")
        else:
            item["text"] = val
        updated.append(item)
    return updated


def _resolve_raw_path(item: dict) -> Path | None:
    raw_rel = str(item.get("raw_path", "")).strip()
    if raw_rel:
        candidate = (ROOT / raw_rel).resolve()
        root_resolved = ROOT.resolve()
        allowed = str(candidate).startswith(str(root_resolved))
        if not allowed:
            for alias in ("data", "forms/user-filled", "forms/raw"):
                alias_root = (ROOT / alias).resolve()
                if str(candidate).startswith(str(alias_root)):
                    allowed = True
                    break
        if allowed and candidate.exists():
            return candidate
    fallback = ROOT / "forms" / "raw" / item["state"] / f"{item['id']}.pdf"
    return fallback if fallback.exists() else None


def _is_fillable(raw_path: Path) -> bool:
    doc = fitz.open(str(raw_path))
    try:
        for page in doc:
            if list(page.widgets()):
                return True
        return False
    finally:
        doc.close()


def apply_settings_to_all_pdfs(queue: dict) -> dict:
    """Regenerate every city PDF that has a layout or fillable fields."""
    settings = load_settings()
    results: dict[str, list] = {"updated": [], "skipped": [], "errors": []}

    for item in queue.get("items", []):
        form_id = item["id"]
        city = item.get("city", form_id)
        state = item.get("state", "")
        raw_path = _resolve_raw_path(item)
        if raw_path is None:
            results["skipped"].append({"id": form_id, "city": city, "reason": "no raw PDF"})
            continue

        dest = filled_path(state, form_id)
        dest.parent.mkdir(parents=True, exist_ok=True)
        rel_dest = str(dest.relative_to(ROOT)).replace("\\", "/")

        try:
            layout = load_layout(form_id)
            if layout and layout.get("elements"):
                elements = _update_layout_elements(layout["elements"], settings)
                save_elements_pdf(raw_path, dest, elements)
                save_layout(form_id, elements)
            elif _is_fillable(raw_path):
                elements = suggest_elements(raw_path)
                if not elements:
                    results["skipped"].append(
                        {"id": form_id, "city": city, "reason": "fillable PDF has no recognized contact fields"}
                    )
                    continue
                save_elements_pdf(raw_path, dest, elements)
            else:
                results["skipped"].append(
                    {"id": form_id, "city": city, "reason": "no saved layout or fillable fields"}
                )
                continue

            record_save(item, rel_dest, source="bulk_apply")
            results["updated"].append({"id": form_id, "city": city, "state": state, "path": rel_dest})
        except Exception as exc:
            results["errors"].append({"id": form_id, "city": city, "error": str(exc)})

    return results