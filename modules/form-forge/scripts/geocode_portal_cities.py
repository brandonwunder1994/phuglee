"""Geocode all registry cities missing exact coordinates."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import load_registry

sys.path.insert(0, str(ROOT / "scripts"))
from geocode_cities import OUT_PATH, geocode  # noqa: E402


def _save(existing: dict) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(existing, indent=2), encoding="utf-8")


def main() -> None:
    registry = load_registry()
    existing: dict = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    targets = [c for c in registry.get("cities", []) if c.get("pathway") != "email_pdf"]
    failed: list[str] = []
    added = 0
    skipped = 0

    for idx, city in enumerate(targets):
        city_id = city["id"]
        if city_id in existing and existing[city_id].get("lat"):
            skipped += 1
            continue
        name, state = city["city"], city["state"]
        try:
            coords = geocode(name, state)
        except Exception as exc:
            coords = None
            print(f"ERR  {name}, {state}: {exc}")
        if coords:
            existing[city_id] = {
                "id": city_id,
                "city": name,
                "state": state,
                "lat": coords[0],
                "lng": coords[1],
                "source": "nominatim",
            }
            added += 1
            _save(existing)
            print(f"OK   {name}, {state}")
        else:
            failed.append(f"{name}, {state}")
            print(f"FAIL {name}, {state}")
        if idx < len(targets) - 1:
            time.sleep(1.1)

    print(f"\nAdded {added} coordinates, skipped {skipped} existing ({len(existing)} total) -> {OUT_PATH}")
    if failed:
        print(f"Failed ({len(failed)}):", ", ".join(failed[:10]), "..." if len(failed) > 10 else "")


if __name__ == "__main__":
    main()