from __future__ import annotations

import hashlib
import json
from pathlib import Path

from review_portal.portal_registry import EXCLUDED_STATES, LEADS_UNAVAILABLE_STATES, load_registry

ROOT = Path(__file__).resolve().parents[1]
QUEUE_PATH = ROOT / "data" / "review-queue.json"
COORDS_PATH = ROOT / "data" / "city-coordinates.json"
COUNTIES_PATH = ROOT / "data" / "city-counties.json"
REGISTRY_PATH = ROOT / "data" / "portal-registry.json"
MAP_BOOTSTRAP_PATH = ROOT / "data" / "coverage-map-bootstrap.json"


def _source_mtime() -> float:
    mtimes = [0.0]
    for path in (QUEUE_PATH, COORDS_PATH, COUNTIES_PATH, REGISTRY_PATH):
        if path.exists():
            mtimes.append(path.stat().st_mtime)
    return max(mtimes)

STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "Arizona": (34.048928, -111.093735),
    "Colorado": (39.113014, -105.358887),
    "Connecticut": (41.599998, -72.699997),
    "Florida": (27.994402, -81.760254),
    "Georgia": (33.247875, -83.441162),
    "North Carolina": (35.782169, -80.793457),
    "Ohio": (40.367474, -82.996216),
    "Rhode Island": (41.742325, -71.742332),
    "Texas": (31.968599, -99.901813),
    "Wyoming": (42.755966, -107.302490),
}


def _load_coords() -> dict[str, dict]:
    if not COORDS_PATH.exists():
        return {}
    return json.loads(COORDS_PATH.read_text(encoding="utf-8"))


def _load_counties() -> dict[str, dict]:
    if not COUNTIES_PATH.exists():
        return {}
    return json.loads(COUNTIES_PATH.read_text(encoding="utf-8"))


def _fallback_coords(city_id: str, state: str) -> tuple[float | None, float | None]:
    base = STATE_CENTROIDS.get(state)
    if not base:
        return None, None
    digest = int(hashlib.md5(city_id.encode("utf-8")).hexdigest()[:8], 16)
    lat_offset = ((digest % 1000) / 1000 - 0.5) * 2.2
    lng_offset = (((digest // 1000) % 1000) / 1000 - 0.5) * 2.8
    return base[0] + lat_offset, base[1] + lng_offset


def _resolve_coords(city_id: str, state: str, coords: dict[str, dict]) -> tuple[float | None, float | None, bool]:
    geo = coords.get(city_id, {})
    lat = geo.get("lat")
    lng = geo.get("lng")
    if lat and lng:
        return lat, lng, True
    lat, lng = _fallback_coords(city_id, state)
    return lat, lng, False


def _slim_map_city(
    *,
    city_id: str,
    city: str,
    state: str,
    pin_type: str,
    lat: float | None,
    lng: float | None,
    exact: bool,
    portal_url: str = "",
    pdf_path: str = "",
    saved_at: str = "",
    requests: dict | None = None,
    submissions: list | None = None,
) -> dict:
    water = (requests or {}).get("water_shutoff", {})
    cv = (requests or {}).get("code_violation", {})
    subs = submissions or []
    submitted = [s for s in subs if s.get("action") == "submitted"]
    last = submitted[0] if submitted else {}
    return {
        "id": city_id,
        "city": city,
        "state": state,
        "lat": lat,
        "lng": lng,
        "url": portal_url,
        "portal_url": portal_url,
        "saved_at": saved_at,
        "pdf_path": pdf_path,
        "has_coords": bool(lat and lng),
        "coords_exact": exact,
        "pin_type": pin_type,
        "county": "",
        "submission_count": len(subs),
        "last_submitted_at": last.get("logged_at", ""),
        "last_channel": last.get("channel", ""),
        "requests": {
            "water_shutoff": {"response_status": water.get("response_status", "pending")},
            "code_violation": {"response_status": cv.get("response_status", "pending")},
        },
    }


def _build_completed_layer(coords: dict[str, dict]) -> dict:
    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    completed = [i for i in queue.get("items", []) if i.get("status") == "completed"]

    cities = []
    state_counts: dict[str, int] = {}

    for item in completed:
        state = item["state"]
        if state in EXCLUDED_STATES or state in LEADS_UNAVAILABLE_STATES:
            continue
        state_counts[state] = state_counts.get(state, 0) + 1
        lat, lng, exact = _resolve_coords(item["id"], state, coords)
        cities.append(
            _slim_map_city(
                city_id=item["id"],
                city=item["city"],
                state=state,
                pin_type="completed",
                lat=lat,
                lng=lng,
                exact=exact,
                portal_url=item.get("url", ""),
                pdf_path=item.get("user_filled_path", ""),
                saved_at=item.get("saved_at", ""),
            )
        )

    states = [
        {"name": name, "count": count}
        for name, count in sorted(state_counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {
        "total_cities": len(cities),
        "total_states": len(state_counts),
        "states": states,
        "cities": cities,
        "max_count": max(state_counts.values()) if state_counts else 0,
        "coords_available": sum(1 for c in cities if c["has_coords"]),
    }


def _build_portal_layer(coords: dict[str, dict]) -> dict:
    registry = load_registry()
    cities = []
    state_counts: dict[str, int] = {}

    for raw in registry.get("cities", []):
        if raw.get("pathway") == "email_pdf":
            continue
        state = raw["state"]
        if state in EXCLUDED_STATES or state in LEADS_UNAVAILABLE_STATES:
            continue
        state_counts[state] = state_counts.get(state, 0) + 1
        lat, lng, exact = _resolve_coords(raw["id"], state, coords)
        pdf = raw.get("pdf") or {}
        cities.append(
            _slim_map_city(
                city_id=raw["id"],
                city=raw["city"],
                state=state,
                pin_type="portal",
                lat=lat,
                lng=lng,
                exact=exact,
                portal_url=raw.get("portal_url", ""),
                pdf_path=pdf.get("user_filled_path", ""),
                saved_at=pdf.get("saved_at", ""),
                requests=raw.get("requests"),
                submissions=raw.get("submissions"),
            )
        )

    states = [
        {"name": name, "count": count}
        for name, count in sorted(state_counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    return {
        "total_cities": len(cities),
        "total_states": len(state_counts),
        "states": states,
        "cities": cities,
        "max_count": max(state_counts.values()) if state_counts else 0,
        "coords_available": sum(1 for c in cities if c["has_coords"]),
    }


def _minimal_city(city: dict) -> dict:
    return {
        "id": city["id"],
        "city": city["city"],
        "state": city["state"],
        "lat": city["lat"],
        "lng": city["lng"],
        "pin_type": city.get("pin_type", "completed"),
        "has_coords": city.get("has_coords", False),
        "coords_exact": city.get("coords_exact", False),
        "county": city.get("county", "Unknown County"),
    }


def build_coverage_map_bootstrap() -> dict:
    """Lightweight map init payload (~65KB vs ~640KB full coverage)."""
    payload = build_coverage_payload()
    return {
        "total_cities": payload["total_cities"],
        "total_states": payload["total_states"],
        "max_count": payload["max_count"],
        "coords_exact": payload["coords_exact"],
        "coords_approx": payload["coords_approx"],
        "states": payload["states"],
        "layers": {
            "portal": {"total_cities": payload["layers"]["portal"]["total_cities"]},
            "completed": {"total_cities": payload["layers"]["completed"]["total_cities"]},
        },
        "cities": [_minimal_city(c) for c in payload["cities"]],
    }


def ensure_map_bootstrap_file() -> Path:
    """Write bootstrap JSON when source data changes (fast static serve)."""
    source_mtime = _source_mtime()
    if MAP_BOOTSTRAP_PATH.exists() and MAP_BOOTSTRAP_PATH.stat().st_mtime >= source_mtime:
        return MAP_BOOTSTRAP_PATH
    data = build_coverage_map_bootstrap()
    MAP_BOOTSTRAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAP_BOOTSTRAP_PATH.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return MAP_BOOTSTRAP_PATH


def get_map_city_detail(city_id: str) -> dict | None:
    for city in build_coverage_payload()["cities"]:
        if city["id"] == city_id:
            return city
    return None


_PAYLOAD_CACHE: dict | None = None
_PAYLOAD_MTIME: float = 0.0


def build_coverage_geojson() -> dict:
    payload = build_coverage_payload()
    features = []
    for city in payload["cities"]:
        if not city.get("has_coords") or city.get("lat") is None or city.get("lng") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [city["lng"], city["lat"]]},
                "properties": {
                    "id": city["id"],
                    "city": city["city"],
                    "state": city["state"],
                    "pin_type": city.get("pin_type", "completed"),
                    "coords_exact": bool(city.get("coords_exact")),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def build_coverage_payload() -> dict:
    global _PAYLOAD_CACHE, _PAYLOAD_MTIME
    mtime = _source_mtime()
    if _PAYLOAD_CACHE is not None and mtime == _PAYLOAD_MTIME:
        return _PAYLOAD_CACHE

    coords = _load_coords()
    completed = _build_completed_layer(coords)
    portal = _build_portal_layer(coords)

    combined_states: dict[str, int] = {}
    for layer in (completed, portal):
        for state in layer["states"]:
            combined_states[state["name"]] = combined_states.get(state["name"], 0) + state["count"]

    combined_state_list = [
        {"name": name, "count": count}
        for name, count in sorted(combined_states.items(), key=lambda x: (-x[1], x[0]))
    ]

    all_cities = completed["cities"] + portal["cities"]
    counties = _load_counties()
    for city in all_cities:
        county_info = counties.get(city["id"], {})
        city["county"] = county_info.get("county") or "Unknown County"
    coords_exact = sum(1 for c in all_cities if c.get("coords_exact"))
    coords_approx = sum(1 for c in all_cities if c.get("has_coords") and not c.get("coords_exact"))

    _PAYLOAD_CACHE = {
        "total_cities": completed["total_cities"] + portal["total_cities"],
        "total_states": len(combined_states),
        "states": combined_state_list,
        "cities": all_cities,
        "max_count": max(combined_states.values()) if combined_states else 0,
        "coords_available": completed["coords_available"] + portal["coords_available"],
        "coords_exact": coords_exact,
        "coords_approx": coords_approx,
        "layers": {
            "completed": completed,
            "portal": portal,
        },
    }
    _PAYLOAD_MTIME = mtime
    return _PAYLOAD_CACHE