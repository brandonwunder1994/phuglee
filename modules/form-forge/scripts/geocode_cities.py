"""Geocode completed cities and cache coordinates for the coverage map."""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "data" / "review-queue.json"
OUT_PATH = ROOT / "data" / "city-coordinates.json"

USER_AGENT = "FormForge-CoverageMap/1.0 (city-list-requests; local research tool)"


def _clean_city(city: str) -> str:
    return re.sub(r"\s+CDP$", "", city, flags=re.I).strip()


def geocode(city: str, state: str) -> tuple[float, float] | None:
    city = _clean_city(city)
    query = f"{city}, {state}, USA"
    url = (
        "https://nominatim.openstreetmap.org/search?"
        + urllib.parse.urlencode({"q": query, "format": "json", "limit": 1, "countrycodes": "us"})
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=25) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data:
        return None
    hit = data[0]
    return float(hit["lat"]), float(hit["lon"])


def main() -> None:
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    completed = [i for i in queue["items"] if i.get("status") == "completed"]
    existing: dict = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    out: dict[str, dict] = dict(existing)
    failed: list[str] = []

    for idx, item in enumerate(completed):
        form_id = item["id"]
        if form_id in out and out[form_id].get("lat"):
            continue
        city, state = item["city"], item["state"]
        try:
            coords = geocode(city, state)
        except Exception as exc:
            coords = None
            print(f"ERR  {city}, {state}: {exc}")
        if coords:
            out[form_id] = {
                "id": form_id,
                "city": city,
                "state": state,
                "lat": coords[0],
                "lng": coords[1],
            }
            print(f"OK   {city}, {state}")
        else:
            failed.append(f"{city}, {state}")
            print(f"FAIL {city}, {state}")
        if idx < len(completed) - 1:
            time.sleep(1.1)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nSaved {len(out)} coordinates to {OUT_PATH}")
    if failed:
        print(f"Failed ({len(failed)}):", ", ".join(failed))


if __name__ == "__main__":
    main()