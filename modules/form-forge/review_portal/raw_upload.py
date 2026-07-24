from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "forms" / "raw"
PREVIEWS = ROOT / "forms" / "previews-raw"
LOG_PATH = ROOT / "data" / "blank-uploads-log.jsonl"

_USER_AGENT = "PhugleeFormForge/1.0 (blank-pdf-import; +https://phuglee.local)"


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


def looks_like_direct_pdf_url(url: str) -> bool:
    """True when the FOIA link is likely a downloadable PDF (not an HTML portal)."""
    text = str(url or "").strip()
    if not text:
        return False
    try:
        parsed = urlparse(text)
    except Exception:
        return False
    if parsed.scheme not in {"http", "https"}:
        return False
    path = unquote(parsed.path or "").lower()
    if path.endswith(".pdf"):
        return True
    # Some CDNs put .pdf before query only — already covered; also match /file.pdf/
    if re.search(r"\.pdf($|[/?#])", path):
        return True
    return False


def fetch_pdf_bytes(url: str, *, timeout: float = 45.0) -> bytes:
    """Download a FOIA form URL. Raises ValueError on non-PDF or network failure."""
    text = str(url or "").strip()
    if not text:
        raise ValueError("No FOIA PDF URL on file for this city.")
    if not text.lower().startswith(("http://", "https://")):
        raise ValueError("FOIA URL must be http(s).")

    req = urllib.request.Request(
        text,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/pdf,*/*",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            content_type = (resp.headers.get("Content-Type") or "").lower()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"City server returned HTTP {exc.code} for FOIA PDF.") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"Could not download FOIA PDF: {exc.reason}") from exc
    except TimeoutError as exc:
        raise ValueError("Timed out downloading FOIA PDF from city site.") from exc

    head = data.lstrip()[:64].lower()
    if "html" in content_type or head.startswith(b"<!doctype") or head.startswith(b"<html"):
        raise ValueError(
            "Downloaded file is not a valid PDF. Link returned a web page, not a PDF — "
            "open FOIA PDF in browser and Save As PDF."
        )
    if not is_pdf(data):
        raise ValueError("Downloaded file is not a valid PDF.")
    return data


def import_blank_pdf_from_url(item: dict, url: str | None = None) -> dict:
    """
    Fetch the city's FOIA PDF URL and store it as the blank form (raw_path).
    Same result as manual Upload Blank PDF.
    """
    source = (url or item.get("url") or item.get("portal_url") or "").strip()
    data = fetch_pdf_bytes(source)
    meta = save_blank_pdf(item, data)
    meta["source_url"] = source
    return meta


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