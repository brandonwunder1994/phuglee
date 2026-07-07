from __future__ import annotations

from pathlib import Path

import fitz

from review_portal.data_guard import atomic_replace_file, atomic_write_bytes, version_before_overwrite
from review_portal.office_use_boundary import filter_elements

ROOT = Path(__file__).resolve().parents[1]
SIG_PATH = ROOT / "config" / "signature-brandon.png"
DEFAULT_SIG_WIDTH = 130.0
DEFAULT_SIG_HEIGHT = 28.0
MAX_SIG_WIDTH = 220.0
MAX_SIG_HEIGHT = 70.0


def _y_top(el: dict) -> float:
    if el.get("y_mode") == "top":
        return float(el["y"])
    page_h = float(el.get("page_height", 0))
    if page_h:
        return page_h - float(el["y"])
    return float(el["y"])


def _normalize_signature_size(width: float, height: float, page_rect: fitz.Rect) -> tuple[float, float]:
    """Prevent runaway signature dimensions from covering the form."""
    w, h = float(width), float(height)
    page_w, page_h = page_rect.width, page_rect.height
    if (
        w <= 0
        or h <= 0
        or w > MAX_SIG_WIDTH
        or h > MAX_SIG_HEIGHT
        or w > page_w * 0.35
        or h > page_h * 0.12
    ):
        return DEFAULT_SIG_WIDTH, DEFAULT_SIG_HEIGHT
    return w, h


def _text_lines(text: str) -> list[str]:
    """Only split on newlines the user explicitly typed — never auto-wrap."""
    if not text:
        return []
    return text.split("\n")


def _place_text(page, x: float, y_top: float, text: str, size: float, box_w: float | None, box_h: float | None) -> None:
    if not text:
        return

    line_lead = max(size * 1.2, size + 2)
    lines = _text_lines(text)

    for i, line in enumerate(lines):
        if not line and i < len(lines) - 1:
            continue
        y_line = y_top + size * 0.85 + i * line_lead
        page.insert_text(
            (x, y_line),
            line,
            fontsize=size,
            fontname="helv",
            color=(0, 0, 0),
            overlay=True,
        )


def save_elements_pdf(raw_path: Path, dest_path: Path, elements: list[dict]) -> None:
    elements = filter_elements(elements, raw_path)
    doc = fitz.open(str(raw_path))

    for el in elements:
        page_idx = int(el.get("page", 0))
        if page_idx >= len(doc):
            continue
        page = doc[page_idx]
        page_h = page.rect.height
        x = float(el["x"])
        y_top = _y_top({**el, "page_height": page_h})
        etype = el.get("type", "text")
        size = float(el.get("fontsize", 10))

        if etype == "signature":
            w, h = _normalize_signature_size(
                el.get("width", DEFAULT_SIG_WIDTH),
                el.get("height", DEFAULT_SIG_HEIGHT),
                page.rect,
            )
            sig = SIG_PATH if SIG_PATH.exists() else ROOT / "config" / "signature.png"
            rect = fitz.Rect(x, y_top, x + w, y_top + h)
            if sig.exists():
                page.insert_image(rect, filename=str(sig), overlay=True)
            else:
                page.insert_text(
                    (x, y_top + size * 0.85),
                    el.get("text", "Brandon Wunder"),
                    fontsize=size,
                    fontname="helv",
                    overlay=True,
                )
        elif etype == "checkbox":
            box = float(el.get("box_size", 30))
            rect = fitz.Rect(x, y_top, x + box, y_top + box)
            page.draw_rect(rect, color=(0, 0, 0), width=1.2, overlay=True)
            if el.get("checked", True):
                mark_size = max(12.0, box * 0.72)
                page.insert_text(
                    (x + box * 0.28, y_top + box * 0.82),
                    "X",
                    fontsize=mark_size,
                    fontname="helv",
                    overlay=True,
                )
        else:
            text = str(el.get("text", ""))
            if text == "Custom text here":
                continue
            box_w = el.get("box_width")
            box_h = el.get("box_height")
            bw = float(box_w) if box_w else None
            bh = float(box_h) if box_h else None
            _place_text(page, x, y_top, text, size, bw, bh)

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest_path.with_suffix(".pdf.part")
    try:
        doc.save(str(tmp), deflate=True, garbage=4)
        doc.close()
        version_before_overwrite(dest_path, "user-filled")
        atomic_replace_file(tmp, dest_path)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def save_uploaded_pdf(dest_path: Path, data: bytes) -> None:
    version_before_overwrite(dest_path, "user-filled")
    atomic_write_bytes(dest_path, data)