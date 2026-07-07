"""Store versioned Data Bridge processed datasets on city profiles."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASETS_ROOT = ROOT / "data" / "bridge-datasets"
MAX_DATASET_BYTES = 25 * 1024 * 1024


class BridgeDatasetError(ValueError):
    pass


def dataset_storage_dir(state: str, city_id: str) -> Path:
    return DATASETS_ROOT / state / city_id


def _safe_filename(name: str) -> str:
    base = Path(name).suffix.lower()
    if base not in {".csv", ".xlsx", ".json"}:
        raise BridgeDatasetError("Dataset artifacts must be .csv, .xlsx, or .json")
    cleaned = re.sub(r"[^\w.\- ]+", "_", Path(name).name.strip()).strip("._ ")
    if not cleaned:
        raise BridgeDatasetError("Invalid filename")
    return cleaned


def _write_bytes(dest: Path, data: bytes) -> None:
    if not data:
        raise BridgeDatasetError("Dataset file is empty")
    if len(data) > MAX_DATASET_BYTES:
        raise BridgeDatasetError("Dataset file is too large (max 25 MB)")
    dest.write_bytes(data)


def save_bridge_dataset(
    city: dict,
    *,
    upload_type: str,
    original_filename: str,
    stats: dict,
    csv_bytes: bytes,
    xlsx_bytes: bytes | None = None,
    metadata: dict | None = None,
    response_received_at: str = "",
) -> dict:
    """Persist a processed Data Bridge dataset and append to city.bridge_datasets."""
    if upload_type not in {"code_violation", "water_shut_off"}:
        raise BridgeDatasetError("upload_type must be code_violation or water_shut_off")

    state = city["state"]
    city_id = city["id"]
    dest_dir = dataset_storage_dir(state, city_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    version_id = f"{stamp}-{city_id}"

    csv_name = _safe_filename(f"{stamp}_bridge-{upload_type}.csv")
    csv_dest = dest_dir / csv_name
    _write_bytes(csv_dest, csv_bytes)

    xlsx_path = ""
    if xlsx_bytes:
        xlsx_name = _safe_filename(f"{stamp}_bridge-{upload_type}.xlsx")
        xlsx_dest = dest_dir / xlsx_name
        _write_bytes(xlsx_dest, xlsx_bytes)
        xlsx_path = str(xlsx_dest.relative_to(ROOT)).replace("\\", "/")

    meta_payload = {
        "version_id": version_id,
        "upload_type": upload_type,
        "original_filename": original_filename,
        "response_received_at": response_received_at or "",
        "attached_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "metadata": metadata or {},
    }
    meta_name = _safe_filename(f"{stamp}_bridge-{upload_type}-meta.json")
    meta_dest = dest_dir / meta_name
    meta_dest.write_text(json.dumps(meta_payload, indent=2), encoding="utf-8")

    upload_labels = {
        "code_violation": "Code Violation",
        "water_shut_off": "Water Shut Off",
    }
    entry = {
        "id": version_id,
        "upload_type": upload_type,
        "upload_type_label": upload_labels.get(upload_type, upload_type.replace("_", " ").title()),
        "original_filename": original_filename,
        "response_received_at": response_received_at or "",
        "attached_at": meta_payload["attached_at"],
        "kept_count": int((stats or {}).get("kept") or 0),
        "discarded_count": int((stats or {}).get("discarded") or 0),
        "deduplicated_count": int((stats or {}).get("deduplicated") or 0),
        "already_imported_count": int((stats or {}).get("alreadyImported") or 0),
        "csv_path": str(csv_dest.relative_to(ROOT)).replace("\\", "/"),
        "xlsx_path": xlsx_path,
        "meta_path": str(meta_dest.relative_to(ROOT)).replace("\\", "/"),
        "stats": stats or {},
    }

    datasets = city.setdefault("bridge_datasets", [])
    datasets.insert(0, entry)
    return entry


def city_bridge_datasets(city: dict) -> list[dict]:
    rows: list[dict] = []
    for entry in city.get("bridge_datasets") or []:
        csv_path = str(entry.get("csv_path") or "")
        xlsx_path = str(entry.get("xlsx_path") or "")
        meta_path = str(entry.get("meta_path") or "")
        rows.append(
            {
                **entry,
                "csv_download_url": f"/api/file/{csv_path.replace(chr(92), '/')}" if csv_path else "",
                "xlsx_download_url": f"/api/file/{xlsx_path.replace(chr(92), '/')}" if xlsx_path else "",
                "meta_download_url": f"/api/file/{meta_path.replace(chr(92), '/')}" if meta_path else "",
            }
        )
    rows.sort(key=lambda row: row.get("attached_at") or "", reverse=True)
    return rows