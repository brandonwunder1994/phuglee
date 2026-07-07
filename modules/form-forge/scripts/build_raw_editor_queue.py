"""Rebuild the city list for the PDF editor from master-queue data."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
FORMS = ROOT / "forms"
RAW = FORMS / "raw"
USER_FILLED = FORMS / "user-filled"
PREVIEWS = FORMS / "previews-raw"
QUEUE = ROOT / "data" / "review-queue.json"
EXCLUDED_STATES = {"Alabama"}


def slugify(state: str, city: str) -> str:
    raw = f"{state}-{city}".lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")


def raw_form_path(state: str, city: str) -> Path:
    return RAW / state / f"{slugify(state, city)}.pdf"


def load_records() -> list[dict]:
    records: dict[tuple[str, str], dict] = {}
    for path in [ROOT / "data" / "master-queue.json", ROOT / "data" / "batch2-queue.json"]:
        if not path.exists():
            continue
        for rec in json.loads(path.read_text(encoding="utf-8")):
            if rec.get("state") in EXCLUDED_STATES:
                continue
            if rec.get("pathway") == "email_only":
                continue
            key = (rec["state"].strip(), rec["city"].strip())
            records[key] = rec
    return list(records.values())


def pdf_info(path: Path) -> tuple[bool, int, list[str]]:
    try:
        reader = PdfReader(str(path))
        fields = reader.get_fields() or {}
        if fields:
            return True, len(fields), list(fields.keys())[:30]
    except Exception:
        pass
    return False, 0, []


def preview(path: Path, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(path))
    doc[0].get_pixmap(dpi=100).save(str(out))
    doc.close()


def main() -> None:
    USER_FILLED.mkdir(parents=True, exist_ok=True)
    items = []
    fillable_n = flat_n = missing_n = done_n = 0

    for rec in load_records():
        state, city = rec["state"], rec["city"]
        slug = slugify(state, city)
        raw = raw_form_path(state, city)
        if not raw.exists() and rec.get("local_form_path"):
            src = ROOT / rec["local_form_path"]
            if src.exists():
                raw.parent.mkdir(parents=True, exist_ok=True)
                raw.write_bytes(src.read_bytes())

        user_out = USER_FILLED / state / f"{slug}.pdf"
        preview_path = PREVIEWS / state / f"{slug}.png"

        if not raw.exists():
            missing_n += 1
            items.append(
                {
                    "id": slug,
                    "state": state,
                    "city": city,
                    "email": rec.get("send_to_email") or rec.get("contact_email"),
                    "raw_path": "",
                    "user_filled_path": "",
                    "preview_path": "",
                    "fillable": False,
                    "field_count": 0,
                    "field_names": [],
                    "status": "missing_pdf",
                    "url": rec.get("form_source_url") or rec.get("url") or "",
                }
            )
            continue

        is_fillable, fcount, fnames = pdf_info(raw)
        if is_fillable:
            fillable_n += 1
        else:
            flat_n += 1
        preview(raw, preview_path)

        status = "completed" if user_out.exists() else "pending"
        if status == "completed":
            done_n += 1

        items.append(
            {
                "id": slug,
                "state": state,
                "city": city,
                "email": rec.get("send_to_email") or rec.get("contact_email"),
                "raw_path": str(raw.relative_to(ROOT)).replace("\\", "/"),
                "user_filled_path": str(user_out.relative_to(ROOT)).replace("\\", "/") if user_out.exists() else "",
                "preview_path": str(preview_path.relative_to(ROOT)).replace("\\", "/"),
                "fillable": is_fillable,
                "field_count": fcount,
                "field_names": fnames,
                "status": status,
                "url": rec.get("form_source_url") or rec.get("url") or "",
            }
        )

    queue = {
        "mode": "manual_editor",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(items),
        "stats": {
            "fillable": fillable_n,
            "flat": flat_n,
            "missing_pdf": missing_n,
            "completed": done_n,
            "pending": len(items) - done_n - missing_n,
        },
        "items": sorted(items, key=lambda x: (x["state"], x["city"])),
    }
    QUEUE.write_text(json.dumps(queue, indent=2), encoding="utf-8")
    print(json.dumps(queue["stats"], indent=2))
    print(f"Queue: {QUEUE}")


if __name__ == "__main__":
    main()