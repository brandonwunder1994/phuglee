"""Fetch and cache municipal boundary polygons for the coverage map."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOUNDARIES_DIR = ROOT / "data" / "city-boundaries"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "FormForgeCoverageMap/1.0 (public-records coverage map; contact: support@formforge.local)"
_LAST_FETCH_AT = 0.0
_MIN_INTERVAL_SEC = 1.1


def _rate_limit() -> None:
    global _LAST_FETCH_AT
    elapsed = time.monotonic() - _LAST_FETCH_AT
    if elapsed < _MIN_INTERVAL_SEC:
        time.sleep(_MIN_INTERVAL_SEC - elapsed)
    _LAST_FETCH_AT = time.monotonic()


def _cache_path(city_id: str) -> Path:
    return BOUNDARIES_DIR / f"{city_id}.json"


def _read_cache(city_id: str) -> dict | None:
    path = _cache_path(city_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if data.get("not_found"):
        return None
    if data.get("geometry"):
        return data
    return None


def _write_cache(city_id: str, payload: dict) -> None:
    BOUNDARIES_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(city_id).write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def _boundary_feature_score(feature: dict) -> int:
    props = feature.get("properties") or {}
    category = str(props.get("category", "")).lower()
    ftype = str(props.get("type", "")).lower()
    class_type = str(props.get("class", "")).lower()
    scores = {
        "city": 100,
        "town": 95,
        "village": 90,
        "hamlet": 85,
        "municipality": 80,
        "administrative": 40,
        "boundary": 20,
    }
    return max(
        scores.get(category, 0),
        scores.get(ftype, 0),
        scores.get(class_type, 0),
    )


def _pick_boundary_feature(features: list[dict]) -> dict | None:
    ranked = []
    for feature in features:
        geom = feature.get("geometry")
        if not geom or geom.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        ranked.append((_boundary_feature_score(feature), feature))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1]


def _fetch_nominatim(city: str, state: str) -> dict | None:
    query = f"{city}, {state}, United States"
    params = urllib.parse.urlencode(
        {
            "q": query,
            "format": "geojson",
            "polygon_geojson": 1,
            "limit": 5,
            "countrycodes": "us",
        }
    )
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    _rate_limit()
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    features = payload.get("features") or []
    feature = _pick_boundary_feature(features)
    if not feature:
        return None
    props = feature.get("properties") or {}
    return {
        "type": "Feature",
        "geometry": feature["geometry"],
        "properties": {
            "name": props.get("name") or city,
            "display_name": props.get("display_name", ""),
            "source": "nominatim",
        },
    }


def get_city_boundary(city_id: str, *, city: str, state: str) -> dict | None:
    cached = _read_cache(city_id)
    if cached is not None:
        return cached

    try:
        boundary = _fetch_nominatim(city, state)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        boundary = None

    if boundary:
        _write_cache(city_id, boundary)
        return boundary

    _write_cache(city_id, {"not_found": True, "city_id": city_id})
    return None