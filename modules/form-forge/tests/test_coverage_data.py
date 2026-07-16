import json
from pathlib import Path

from review_portal.coverage_data import build_coverage_geojson, build_coverage_map_bootstrap, build_coverage_payload

REF_CITIES_PATH = (
    Path(__file__).resolve().parents[1] / "review_portal" / "static" / "geo" / "us-reference-cities.geojson"
)


def test_coverage_payload_includes_coord_stats():
    payload = build_coverage_payload()
    assert "coords_exact" in payload
    assert "coords_approx" in payload
    assert payload["coords_exact"] + payload["coords_approx"] == payload["coords_available"]
    assert "unavailable_states" in payload
    assert "Alabama" in payload["unavailable_states"]
    for city in payload["cities"]:
        assert "coords_exact" in city
        if city["coords_exact"]:
            assert city["has_coords"]


def test_map_bootstrap_is_much_smaller_than_full_payload():
    full = build_coverage_payload()
    boot = build_coverage_map_bootstrap()
    assert len(boot["cities"]) == len(full["cities"])
    assert "requests" not in boot["cities"][0]
    assert boot["layers"]["portal"]["total_cities"] == full["layers"]["portal"]["total_cities"]


def test_map_bootstrap_includes_county_for_covered_cities():
    boot = build_coverage_map_bootstrap()
    assert boot["cities"]
    for city in boot["cities"]:
        assert "county" in city
        assert city["county"]
    unknown = [c for c in boot["cities"] if c["county"] == "Unknown County"]
    assert len(unknown) < len(boot["cities"]) * 0.1


def test_coverage_geojson_has_point_features():
    geo = build_coverage_geojson()
    assert geo["type"] == "FeatureCollection"
    assert len(geo["features"]) > 0
    feat = geo["features"][0]
    assert feat["geometry"]["type"] == "Point"
    assert "id" in feat["properties"]


def test_coverage_excludes_unavailable_lead_states():
    payload = build_coverage_payload()
    blocked = {"Alabama", "Arkansas", "Delaware", "Kentucky", "South Carolina", "Virginia"}
    states = {s["name"] for s in payload["states"]}
    city_states = {c["state"] for c in payload["cities"]}
    assert not states & blocked
    assert not city_states & blocked


def test_unavailable_states_constant_matches_blocked_list():
    from review_portal.portal_registry import LEADS_UNAVAILABLE_STATES

    assert LEADS_UNAVAILABLE_STATES == frozenset({
        "Alabama",
        "Arkansas",
        "Delaware",
        "Kentucky",
        "South Carolina",
        "Virginia",
    })


def test_coverage_excludes_alaska():
    payload = build_coverage_payload()
    states = {s["name"] for s in payload["states"]}
    city_states = {c["state"] for c in payload["cities"]}
    assert "Alaska" not in states
    assert "Alaska" not in city_states
    assert not any(c["id"].startswith("alaska-") for c in payload["cities"])


def test_reference_cities_exist_for_covered_states():
    ref = json.loads(REF_CITIES_PATH.read_text(encoding="utf-8"))
    payload = build_coverage_payload()
    covered = {s["name"] for s in payload["states"] if s["count"] > 0}
    ref_by_state: dict[str, list[str]] = {}
    for feat in ref["features"]:
        st = feat["properties"]["state"]
        ref_by_state.setdefault(st, []).append(feat["properties"]["name"])
    for state in covered:
        assert state in ref_by_state, f"missing reference cities for covered state {state}"
        assert len(ref_by_state[state]) >= 1


def test_reference_cities_include_capitals_and_majors():
    geo = json.loads(REF_CITIES_PATH.read_text(encoding="utf-8"))
    assert geo["type"] == "FeatureCollection"
    assert len(geo["features"]) >= 145
    capitals = [f for f in geo["features"] if f["properties"].get("capital")]
    majors = [f for f in geo["features"] if f["properties"].get("tier") == 1]
    assert len(capitals) >= 49
    assert len(majors) >= 30
    names = {f["properties"]["name"] for f in geo["features"]}
    assert "Phoenix" in names
    assert "New York" in names
    assert "Washington" in names
    assert "Anchorage" not in names


def test_states_geojson_is_lower_48():
    states_path = Path(__file__).resolve().parents[1] / "review_portal" / "static" / "geo" / "us-states.geojson"
    geo = json.loads(states_path.read_text(encoding="utf-8"))
    names = {f["properties"]["name"] for f in geo["features"]}
    assert "Alaska" not in names
    assert "Hawaii" not in names
    assert len(names) == 49  # 48 states + DC