"""Resolve county for each covered city via FCC Census area API (free, no key)."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COORDS_PATH = ROOT / "data" / "city-coordinates.json"
REGISTRY_PATH = ROOT / "data" / "portal-registry.json"
QUEUE_PATH = ROOT / "data" / "review-queue.json"
OUT_PATH = ROOT / "data" / "city-counties.json"

USER_AGENT = "FormForge-CoverageMap/1.0 (city-list-requests; local research tool)"
FCC_URL = "https://geo.fcc.gov/api/census/area"


def _city_ids() -> list[str]:
    ids: set[str] = set()
    if COORDS_PATH.exists():
        ids.update(json.loads(COORDS_PATH.read_text(encoding="utf-8")).keys())
    if REGISTRY_PATH.exists():
        for row in json.loads(REGISTRY_PATH.read_text(encoding="utf-8")).get("cities", []):
            ids.add(row["id"])
    if QUEUE_PATH.exists():
        for row in json.loads(QUEUE_PATH.read_text(encoding="utf-8")).get("items", []):
            ids.add(row["id"])
    return sorted(ids)


def _coords_by_id() -> dict[str, dict]:
    if not COORDS_PATH.exists():
        return {}
    return json.loads(COORDS_PATH.read_text(encoding="utf-8"))


def lookup_county(lat: float, lng: float) -> dict | None:
    query = urllib.parse.urlencode({"lat": lat, "lon": lng, "format": "json"})
    req = urllib.request.Request(f"{FCC_URL}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    results = data.get("results") or []
    if not results:
        return None
    hit = results[0]
    return {
        "county": hit.get("county_name") or "Unknown County",
        "county_fips": hit.get("county_fips", ""),
        "state_code": hit.get("state_code", ""),
    }


def main() -> None:
    coords = _coords_by_id()
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        existing = json.loads(OUT_PATH.read_text(encoding="utf-8"))

    out: dict[str, dict] = dict(existing)
    missing: list[str] = []
    failed: list[str] = []

    for idx, city_id in enumerate(_city_ids()):
        if city_id in out and out[city_id].get("county"):
            continue
        geo = coords.get(city_id, {})
        lat = geo.get("lat")
        lng = geo.get("lng")
        if not lat or not lng:
            missing.append(city_id)
            out[city_id] = {"county": "Unknown County", "county_fips": "", "state_code": ""}
            continue
        try:
            info = lookup_county(float(lat), float(lng))
            if not info:
                failed.append(city_id)
                out[city_id] = {"county": "Unknown County", "county_fips": "", "state_code": ""}
            else:
                out[city_id] = info
        except Exception:
            failed.append(city_id)
            out[city_id] = {"county": "Unknown County", "county_fips": "", "state_code": ""}
        if idx % 25 == 24:
            time.sleep(0.35)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    unknown = sum(1 for v in out.values() if v.get("county") == "Unknown County")
    print(f"Wrote {len(out)} county rows to {OUT_PATH}")
    print(f"Unknown: {unknown} · missing coords: {len(missing)} · lookup failed: {len(failed)}")


if __name__ == "__main__":
    main()