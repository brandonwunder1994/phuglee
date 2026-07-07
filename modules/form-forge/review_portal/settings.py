from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETTINGS_PATH = ROOT / "config" / "settings.json"

def format_full_address(street: str, city: str, state: str, zip_code: str) -> str:
    if street and city:
        return f"{street}, {city}, {state} {zip_code}".strip(", ")
    return ""


def sync_full_address(data: dict) -> dict:
    data["full_address"] = format_full_address(
        data.get("street", ""),
        data.get("city", ""),
        data.get("state", ""),
        data.get("zip", ""),
    )
    return data


DEFAULTS = {
    "name": "",
    "signature_name": "",
    "street": "",
    "city": "",
    "state": "",
    "zip": "",
    "phone": "",
    "email": "",
    "request_text": "I am requesting information about any code violations related to tall grass/weeds or trash/debris in the last 30 days.",
    "reason": "Personal Research",
    "last_30_days_text": "The Last 30 Days",
    "full_address": "",
    "paths": {"desktop_folder": str(Path.home() / "Desktop" / "Completed City Forms")},
}


def load_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return dict(DEFAULTS)
    data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    merged = {**DEFAULTS, **data}
    merged["paths"] = {**DEFAULTS["paths"], **data.get("paths", {})}
    return sync_full_address(merged)


def save_settings(data: dict) -> dict:
    current = load_settings()
    for key in (
        "name", "signature_name", "street", "city", "state", "zip", "phone", "email",
        "request_text", "reason", "last_30_days_text",
    ):
        if key in data:
            current[key] = str(data[key]).strip()
    sync_full_address(current)
    if "paths" in data and isinstance(data["paths"], dict) and data["paths"].get("desktop_folder"):
        current["paths"]["desktop_folder"] = str(data["paths"]["desktop_folder"]).strip()
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_PATH.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return current


def desktop_dir() -> Path:
    return Path(load_settings()["paths"]["desktop_folder"])