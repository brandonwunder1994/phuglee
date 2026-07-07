"""Store raw city response lists (CSV, Excel, PDF, etc.) with the portal registry."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LISTS_ROOT = ROOT / "data" / "city-response-lists"
MAX_LIST_BYTES = 25 * 1024 * 1024
ALLOWED_EXTENSIONS = frozenset(
    {
        ".csv",
        ".tsv",
        ".txt",
        ".pdf",
        ".xlsx",
        ".xls",
        ".doc",
        ".docx",
        ".jpg",
        ".jpeg",
        ".png",
        ".zip",
    }
)

FILE_TYPE_BY_EXT: dict[str, tuple[str, str]] = {
    ".xlsx": ("excel", "Excel"),
    ".xls": ("excel", "Excel"),
    ".pdf": ("pdf", "PDF"),
    ".jpg": ("jpg", "JPG"),
    ".jpeg": ("jpg", "JPG"),
    ".png": ("image", "Image"),
    ".doc": ("word", "Word Doc"),
    ".docx": ("word", "Word Doc"),
    ".csv": ("csv", "CSV"),
    ".tsv": ("tsv", "TSV"),
    ".txt": ("text", "Text"),
    ".zip": ("zip", "ZIP"),
}


class CityListUploadError(ValueError):
    pass


def detect_file_type(filename: str) -> tuple[str, str]:
    ext = Path(filename).suffix.lower()
    return FILE_TYPE_BY_EXT.get(ext, ("other", "Other"))


def file_type_fields(filename: str) -> dict[str, str]:
    file_type, file_type_label = detect_file_type(filename)
    return {
        "file_type": file_type,
        "file_type_label": file_type_label,
        "extension": Path(filename).suffix.lower().lstrip("."),
    }


def enrich_list_file_entry(entry: dict) -> dict:
    filename = str(entry.get("filename") or "")
    fields = file_type_fields(filename) if filename else {
        "file_type": "other",
        "file_type_label": "Other",
        "extension": "",
    }
    return {**entry, **fields}


def _safe_filename(name: str) -> str:
    base = Path(name).name.strip()
    if not base:
        raise CityListUploadError("Filename is required")
    cleaned = re.sub(r"[^\w.\- ]+", "_", base).strip("._ ")
    if not cleaned:
        raise CityListUploadError("Invalid filename")
    ext = Path(cleaned).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise CityListUploadError(f"Unsupported file type. Allowed: {allowed}")
    return cleaned


def list_storage_dir(state: str, city_id: str, request_type: str) -> Path:
    return LISTS_ROOT / state / city_id / request_type


def save_city_response_list(
    city: dict,
    request_type: str,
    *,
    filename: str,
    data: bytes,
    response_status: str = "",
) -> dict:
    if not data:
        raise CityListUploadError("Uploaded file is empty")
    if len(data) > MAX_LIST_BYTES:
        raise CityListUploadError("File is too large (max 25 MB)")

    safe_name = _safe_filename(filename)
    state = city["state"]
    city_id = city["id"]
    dest_dir = list_storage_dir(state, city_id, request_type)
    dest_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    stored_name = f"{stamp}_{safe_name}"
    dest = dest_dir / stored_name
    dest.write_bytes(data)

    rel_path = str(dest.relative_to(ROOT)).replace("\\", "/")
    entry = {
        "id": f"{stamp}-{city_id}",
        "filename": safe_name,
        "stored_path": rel_path,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "request_type": request_type,
        "response_status": response_status,
        "size_bytes": len(data),
        **file_type_fields(safe_name),
    }
    req = city.setdefault("requests", {}).setdefault(request_type, {})
    files = req.setdefault("list_files", [])
    files.insert(0, entry)
    return entry


def city_response_list_files(city: dict) -> list[dict]:
    rows: list[dict] = []
    for request_type, req in (city.get("requests") or {}).items():
        for entry in req.get("list_files") or []:
            enriched = enrich_list_file_entry(entry)
            rows.append(
                {
                    **enriched,
                    "request_type": enriched.get("request_type") or request_type,
                    "download_url": f"/api/file/{str(enriched.get('stored_path', '')).replace(chr(92), '/')}",
                }
            )
    rows.sort(key=lambda row: row.get("uploaded_at") or "", reverse=True)
    return rows