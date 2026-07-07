from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from review_portal import coverage_boundaries as boundaries


class CoverageBoundariesTests(unittest.TestCase):
    def test_pick_boundary_feature_prefers_city(self) -> None:
        features = [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                "properties": {"category": "boundary", "type": "administrative"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[2, 2], [3, 2], [3, 3], [2, 2]]]},
                "properties": {"category": "place", "type": "city", "name": "Avondale"},
            },
        ]
        picked = boundaries._pick_boundary_feature(features)
        self.assertEqual(picked["properties"]["name"], "Avondale")

    def test_get_city_boundary_uses_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            cached = {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
                "properties": {"name": "Avondale"},
            }
            city_id = "arizona-avondale"
            with patch.object(boundaries, "BOUNDARIES_DIR", cache_dir):
                (cache_dir / f"{city_id}.json").write_text(json.dumps(cached), encoding="utf-8")
                result = boundaries.get_city_boundary(city_id, city="Avondale", state="Arizona")
        self.assertEqual(result, cached)

    def test_get_city_boundary_writes_not_found_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = Path(tmp)
            city_id = "arizona-nowhere"
            with patch.object(boundaries, "BOUNDARIES_DIR", cache_dir):
                with patch.object(boundaries, "_fetch_nominatim", return_value=None):
                    result = boundaries.get_city_boundary(city_id, city="Nowhere", state="Arizona")
                    marker = json.loads((cache_dir / f"{city_id}.json").read_text(encoding="utf-8"))
        self.assertIsNone(result)
        self.assertTrue(marker.get("not_found"))


if __name__ == "__main__":
    unittest.main()