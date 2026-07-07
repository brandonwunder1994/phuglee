"""One-time: convert us-atlas TopoJSON to local GeoJSON for fast map load."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "review_portal" / "static" / "geo" / "us-states.geojson"
TOPO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"

# Lower 48 + DC on map; drop AK, HI, and territories.
EXCLUDED_MAP_STATES = {
    "Alaska",
    "Hawaii",
    "Puerto Rico",
    "Guam",
    "American Samoa",
    "United States Virgin Islands",
    "Commonwealth of the Northern Mariana Islands",
}


def main() -> None:
    topo = json.loads(urllib.request.urlopen(TOPO_URL, timeout=60).read())
    geometries = topo["objects"]["states"]["geometries"]
    transform = topo["transform"]
    arcs = topo["arcs"]

    def decode_arc(arc_index: int) -> list[list[float]]:
        reverse = arc_index < 0
        arc = arcs[~arc_index if reverse else arc_index]
        x, y = 0.0, 0.0
        coords = []
        for dx, dy in arc:
            x += dx
            y += dy
            lon = x * transform["scale"][0] + transform["translate"][0]
            lat = y * transform["scale"][1] + transform["translate"][1]
            coords.append([lon, lat])
        if reverse:
            coords.reverse()
        return coords

    def decode_ring(ring: list[int]) -> list[list[float]]:
        points: list[list[float]] = []
        for arc_index in ring:
            seg = decode_arc(arc_index)
            if points and seg and points[-1] == seg[0]:
                points.extend(seg[1:])
            else:
                points.extend(seg)
        return points

    features = []
    for geom in geometries:
        name = geom["properties"]["name"]
        if name in EXCLUDED_MAP_STATES:
            continue
        coords_out = []
        if geom["type"] == "Polygon":
            coords_out = [decode_ring(geom["arcs"][0])]
        elif geom["type"] == "MultiPolygon":
            for poly in geom["arcs"]:
                coords_out.append([decode_ring(poly[0])])
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name},
                "geometry": {"type": geom["type"], "coordinates": coords_out},
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    print(f"Wrote {len(features)} states -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()