from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "forms" / "raw"
PREVIEWS = ROOT / "forms" / "previews-raw"
LOG_PATH = ROOT / "data" / "blank-uploads-log.jsonl"


def raw_path(state: str, slug: str) -> Path:
    return RAW / state / f"{slug}.pdf"


def is_pdf(data: bytes) -> bool:
    if not data:
        return False
    trimmed = data.lstrip()[:8]
    if trimmed.startswith(b"%PDF-"):
        return True
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        pages = len(doc)
        doc.close()
        return pages > 0
    except Exception:
        return False


def pdf_field_info(path: Path) -> tuple[bool, int, list[str]]:
    try:
        reader = PdfReader(str(path))
        fields = reader.get_fields() or {}
        if fields:
            return True, len(fields), list(fields.keys())[:30]
    except Exception:
        pass
    return False, 0, []


def _fsync_file(path: Path) -> None:
    with path.open("rb") as fh:
        fh.flush()
        try:
            import os

            os.fsync(fh.fileno())
        except OSError:
            pass


def save_blank_pdf(item: dict, data: bytes) -> dict:
    if not is_pdf(data):
        raise ValueError(
            "File is not a valid PDF. The city download may be an HTML page — "
            "open the link in your browser and use Save As PDF, or print to PDF."
        )

    state = item["state"]
    slug = item["id"]
    dest = raw_path(state, slug)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    _fsync_file(dest)

    is_fillable, field_count, field_names = pdf_field_info(dest)

    preview_rel = ""
    preview_file = PREVIEWS / state / f"{slug}.png"
    try:
        preview_file.parent.mkdir(parents=True, exist_ok=True)
        doc = fitz.open(str(dest))
        doc[0].get_pixmap(dpi=100).save(str(preview_file))
        doc.close()
        preview_rel = str(preview_file.relative_to(ROOT)).replace("\\", "/")
    except Exception:
        pass

    raw_rel = str(dest.relative_to(ROOT)).replace("\\", "/")
    now = datetime.now(timezone.utc).isoformat()
    entry = {
        "uploaded_at": now,
        "id": slug,
        "state": state,
        "city": item["city"],
        "raw_path": raw_rel,
        "fillable": is_fillable,
        "field_count": field_count,
    }
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")

    return {
        "raw_path": raw_rel,
        "preview_path": preview_rel,
        "fillable": is_fillable,
        "field_count": field_count,
        "field_names": field_names,
        "uploaded_at": now,
    }