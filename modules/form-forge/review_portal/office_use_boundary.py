from __future__ import annotations

import re
from pathlib import Path

import fitz

# Text printed on forms marking clerk / admin / office-only sections.
OFFICE_MARKER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"do\s+not\s+write\s+below", re.I),
    re.compile(r"(?:for\s+)?(?:office|official|staff|agency|internal)\s+use\s+only", re.I),
    re.compile(r"office\s+use\s*:", re.I),
    re.compile(r"staff\s+use\s+only", re.I),
    re.compile(r"for\s+internal\s+office\s+use", re.I),
    re.compile(r"open\s+records\s+tracker:\s*for\s+office", re.I),
    re.compile(r"for\s+staff\s+use\s+only", re.I),
    re.compile(r"for\s+clerk\s+use\s+only", re.I),
    re.compile(r"administrative\s+use\s+only", re.I),
    re.compile(r"acknowledgement\s+date", re.I),
    re.compile(r"received\s+by(?:\s+the)?\s+clerk", re.I),
    re.compile(r"date\s+received\s+by", re.I),
]

# Fillable widget names that are always clerk-side even without a printed header.
CLERK_WIDGET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"acknowledgement", re.I),
    re.compile(r"number\s*of\s*pages", re.I),
    re.compile(r"copy\s*fee", re.I),
    re.compile(r"anticipated\s*response", re.I),
    re.compile(r"date\s*completed", re.I),
    re.compile(r"fee\s*paid", re.I),
    re.compile(r"^www\.", re.I),
]

# Widget names that look like request fields but are not user-fillable.
SKIP_WIDGET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"department.*official.*requested", re.I),
    re.compile(r"requested\s*from", re.I),
]


def _line_matches_marker(text: str) -> bool:
    cleaned = " ".join(text.split())
    if not cleaned:
        return False
    return any(p.search(cleaned) for p in OFFICE_MARKER_PATTERNS)


def _widget_is_clerk_field(name: str) -> bool:
    cleaned = " ".join((name or "").split())
    if not cleaned:
        return False
    return any(p.search(cleaned) for p in CLERK_WIDGET_PATTERNS)


def _widget_should_skip(name: str) -> bool:
    cleaned = " ".join((name or "").split())
    if not cleaned:
        return False
    return any(p.search(cleaned) for p in SKIP_WIDGET_PATTERNS)


# Clerk dividers sit in the lower portion of the page. Labels like "Office Use Only:"
# in headers or table columns often appear near the top — ignore those.
MIN_OFFICE_MARKER_FRAC = 0.45


def office_use_boundaries(pdf_path: Path) -> dict[int, float]:
    """Per-page Y cutoff (top-down PDF coords). Fields at or below this Y are office-only."""
    doc = fitz.open(str(pdf_path))
    boundaries: dict[int, float] = {}

    for page_idx, page in enumerate(doc):
        page_h = page.rect.height
        min_y = page_h * MIN_OFFICE_MARKER_FRAC
        cutoff: float | None = None
        blocks = page.get_text("dict").get("blocks", [])
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
                if not _line_matches_marker(text):
                    continue
                y0 = float(line["bbox"][1])
                if y0 < min_y:
                    continue
                cutoff = y0 if cutoff is None else max(cutoff, y0)
        if cutoff is not None:
            boundaries[page_idx] = cutoff

    doc.close()
    return boundaries


def is_office_zone(page: int, y_top: float, boundaries: dict[int, float], *, margin: float = 2.0) -> bool:
    cutoff = boundaries.get(page)
    if cutoff is None:
        return False
    return float(y_top) >= cutoff - margin


def filter_elements(elements: list[dict], pdf_path: Path) -> list[dict]:
    """Drop elements that fall in office / clerk sections."""
    boundaries = office_use_boundaries(pdf_path)
    if not boundaries:
        return elements
    return [
        el
        for el in elements
        if not is_office_zone(int(el.get("page", 0)), float(el.get("y", 0)), boundaries)
    ]


def widget_is_off_limits(field_name: str, page: int, y_top: float, boundaries: dict[int, float]) -> bool:
    if _widget_should_skip(field_name) or _widget_is_clerk_field(field_name):
        return True
    return is_office_zone(page, y_top, boundaries)