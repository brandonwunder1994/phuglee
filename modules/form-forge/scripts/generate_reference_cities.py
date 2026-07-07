"""Generate us-reference-cities.geojson — capitals + major metros for map context labels."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "review_portal" / "static" / "geo" / "us-reference-cities.geojson"

# (name, state, lng, lat, capital, tier) — tier 1=national, 2=regional, 3=state/local
CITIES: list[tuple[str, str, float, float, bool, int]] = [
    # Alabama
    ("Montgomery", "Alabama", -86.3000, 32.3668, True, 2),
    ("Birmingham", "Alabama", -86.8025, 33.5207, False, 2),
    ("Huntsville", "Alabama", -86.5861, 34.7304, False, 3),
    ("Mobile", "Alabama", -88.0431, 30.6954, False, 2),
    # Arizona
    ("Phoenix", "Arizona", -112.0740, 33.4484, True, 1),
    ("Tucson", "Arizona", -110.9747, 32.2226, False, 2),
    ("Mesa", "Arizona", -111.8315, 33.4152, False, 2),
    ("Scottsdale", "Arizona", -111.9261, 33.4942, False, 3),
    # Arkansas
    ("Little Rock", "Arkansas", -92.2896, 34.7465, True, 2),
    ("Fayetteville", "Arkansas", -94.1574, 36.0626, False, 3),
    ("Fort Smith", "Arkansas", -94.3985, 35.3859, False, 3),
    # California
    ("Sacramento", "California", -121.4944, 38.5816, True, 2),
    ("Los Angeles", "California", -118.2437, 34.0522, False, 1),
    ("San Francisco", "California", -122.4194, 37.7749, False, 1),
    ("San Diego", "California", -117.1611, 32.7157, False, 1),
    ("San Jose", "California", -121.8863, 37.3382, False, 1),
    ("Fresno", "California", -119.7871, 36.7378, False, 2),
    ("Oakland", "California", -122.2711, 37.8044, False, 2),
    # Colorado
    ("Denver", "Colorado", -104.9903, 39.7392, True, 1),
    ("Colorado Springs", "Colorado", -104.8214, 38.8339, False, 2),
    ("Aurora", "Colorado", -104.8319, 39.7294, False, 3),
    # Connecticut
    ("Hartford", "Connecticut", -72.6851, 41.7658, True, 2),
    ("Bridgeport", "Connecticut", -73.1952, 41.1865, False, 3),
    ("New Haven", "Connecticut", -72.9279, 41.3083, False, 3),
    # Delaware
    ("Dover", "Delaware", -75.5277, 39.1582, True, 3),
    ("Wilmington", "Delaware", -75.5398, 39.7391, False, 2),
    # Florida
    ("Tallahassee", "Florida", -84.2807, 30.4383, True, 2),
    ("Jacksonville", "Florida", -81.6557, 30.3322, False, 1),
    ("Miami", "Florida", -80.1918, 25.7617, False, 1),
    ("Tampa", "Florida", -82.4572, 27.9506, False, 1),
    ("Orlando", "Florida", -81.3792, 28.5383, False, 2),
    ("St. Petersburg", "Florida", -82.6403, 27.7676, False, 3),
    # Georgia
    ("Atlanta", "Georgia", -84.3880, 33.7490, True, 1),
    ("Savannah", "Georgia", -81.0998, 32.0809, False, 2),
    ("Augusta", "Georgia", -81.9748, 33.4735, False, 3),
    # Idaho
    ("Boise", "Idaho", -116.2023, 43.6150, True, 2),
    ("Idaho Falls", "Idaho", -112.0341, 43.4917, False, 3),
    # Illinois
    ("Springfield", "Illinois", -89.6501, 39.7817, True, 2),
    ("Chicago", "Illinois", -87.6298, 41.8781, False, 1),
    ("Aurora", "Illinois", -88.3201, 41.7606, False, 3),
    ("Rockford", "Illinois", -89.0940, 42.2711, False, 3),
    # Indiana
    ("Indianapolis", "Indiana", -86.1581, 39.7684, True, 1),
    ("Fort Wayne", "Indiana", -85.1394, 41.0793, False, 2),
    ("Evansville", "Indiana", -87.5711, 37.9716, False, 3),
    # Iowa
    ("Des Moines", "Iowa", -93.6091, 41.5868, True, 2),
    ("Cedar Rapids", "Iowa", -91.6708, 41.9779, False, 3),
    ("Davenport", "Iowa", -90.5776, 41.5236, False, 3),
    # Kansas
    ("Topeka", "Kansas", -95.6890, 39.0473, True, 3),
    ("Wichita", "Kansas", -97.3301, 37.6872, False, 2),
    ("Kansas City", "Kansas", -94.6275, 39.1141, False, 2),
    # Kentucky
    ("Frankfort", "Kentucky", -84.8733, 38.2009, True, 3),
    ("Louisville", "Kentucky", -85.7585, 38.2527, False, 1),
    ("Lexington", "Kentucky", -84.5037, 38.0406, False, 2),
    # Louisiana
    ("Baton Rouge", "Louisiana", -91.1403, 30.4515, True, 2),
    ("New Orleans", "Louisiana", -90.0715, 29.9511, False, 1),
    ("Shreveport", "Louisiana", -93.7502, 32.5252, False, 3),
    # Maine
    ("Augusta", "Maine", -69.7795, 44.3106, True, 3),
    ("Portland", "Maine", -70.2553, 43.6591, False, 2),
    # Maryland
    ("Annapolis", "Maryland", -76.4922, 38.9784, True, 3),
    ("Baltimore", "Maryland", -76.6122, 39.2904, False, 1),
    # Massachusetts
    ("Boston", "Massachusetts", -71.0589, 42.3601, True, 1),
    ("Worcester", "Massachusetts", -71.8023, 42.2626, False, 3),
    ("Springfield", "Massachusetts", -72.5898, 42.1015, False, 3),
    # Michigan
    ("Lansing", "Michigan", -84.5555, 42.7325, True, 2),
    ("Detroit", "Michigan", -83.0458, 42.3314, False, 1),
    ("Grand Rapids", "Michigan", -85.6681, 42.9634, False, 2),
    ("Ann Arbor", "Michigan", -83.7430, 42.2808, False, 3),
    # Minnesota
    ("St. Paul", "Minnesota", -93.0900, 44.9537, True, 2),
    ("Minneapolis", "Minnesota", -93.2650, 44.9778, False, 1),
    ("Rochester", "Minnesota", -92.4802, 44.0121, False, 3),
    # Mississippi
    ("Jackson", "Mississippi", -90.1848, 32.2988, True, 2),
    ("Gulfport", "Mississippi", -89.0928, 30.3674, False, 3),
    ("Biloxi", "Mississippi", -88.8850, 30.3960, False, 3),
    # Missouri
    ("Jefferson City", "Missouri", -92.1735, 38.5767, True, 3),
    ("Kansas City", "Missouri", -94.5786, 39.0997, False, 1),
    ("St. Louis", "Missouri", -90.1994, 38.6270, False, 1),
    ("Springfield", "Missouri", -93.2923, 37.2090, False, 3),
    # Montana
    ("Helena", "Montana", -112.0391, 46.5891, True, 3),
    ("Billings", "Montana", -108.5007, 45.7833, False, 2),
    ("Missoula", "Montana", -114.0093, 46.8721, False, 3),
    # Nebraska
    ("Lincoln", "Nebraska", -96.6859, 40.8136, True, 2),
    ("Omaha", "Nebraska", -95.9345, 41.2565, False, 2),
    # Nevada
    ("Carson City", "Nevada", -119.7674, 39.1638, True, 3),
    ("Las Vegas", "Nevada", -115.1398, 36.1699, False, 1),
    ("Reno", "Nevada", -119.8138, 39.5296, False, 2),
    # New Hampshire
    ("Concord", "New Hampshire", -71.5376, 43.2081, True, 3),
    ("Manchester", "New Hampshire", -71.4548, 42.9956, False, 2),
    # New Jersey
    ("Trenton", "New Jersey", -74.7429, 40.2171, True, 3),
    ("Newark", "New Jersey", -74.1724, 40.7357, False, 2),
    ("Jersey City", "New Jersey", -74.0431, 40.7178, False, 3),
    # New Mexico
    ("Santa Fe", "New Mexico", -105.9378, 35.6870, True, 2),
    ("Albuquerque", "New Mexico", -106.6504, 35.0844, False, 2),
    ("Las Cruces", "New Mexico", -106.7637, 32.3199, False, 3),
    # New York
    ("Albany", "New York", -73.7562, 42.6526, True, 2),
    ("New York", "New York", -74.0060, 40.7128, False, 1),
    ("Buffalo", "New York", -78.8784, 42.8864, False, 2),
    ("Rochester", "New York", -77.6109, 43.1566, False, 2),
    ("Syracuse", "New York", -76.1474, 43.0481, False, 3),
    # North Carolina
    ("Raleigh", "North Carolina", -78.6382, 35.7796, True, 1),
    ("Charlotte", "North Carolina", -80.8431, 35.2271, False, 1),
    ("Greensboro", "North Carolina", -79.7920, 36.0726, False, 3),
    ("Durham", "North Carolina", -78.8986, 35.9940, False, 2),
    # North Dakota
    ("Bismarck", "North Dakota", -100.7837, 46.8083, True, 3),
    ("Fargo", "North Dakota", -96.7898, 46.8772, False, 2),
    # Ohio
    ("Columbus", "Ohio", -82.9988, 39.9612, True, 1),
    ("Cleveland", "Ohio", -81.6944, 41.4993, False, 1),
    ("Cincinnati", "Ohio", -84.5120, 39.1031, False, 1),
    ("Toledo", "Ohio", -83.5379, 41.6528, False, 2),
    ("Akron", "Ohio", -81.5190, 41.0814, False, 3),
    # Oklahoma
    ("Oklahoma City", "Oklahoma", -97.5164, 35.4676, True, 1),
    ("Tulsa", "Oklahoma", -95.9928, 36.1540, False, 1),
    ("Norman", "Oklahoma", -97.4395, 35.2226, False, 3),
    # Oregon
    ("Salem", "Oregon", -123.0351, 44.9429, True, 2),
    ("Portland", "Oregon", -122.6765, 45.5152, False, 1),
    ("Eugene", "Oregon", -123.0868, 44.0521, False, 3),
    # Pennsylvania
    ("Harrisburg", "Pennsylvania", -76.8867, 40.2732, True, 2),
    ("Philadelphia", "Pennsylvania", -75.1652, 39.9526, False, 1),
    ("Pittsburgh", "Pennsylvania", -79.9959, 40.4406, False, 1),
    ("Allentown", "Pennsylvania", -75.4902, 40.6084, False, 3),
    # Rhode Island
    ("Providence", "Rhode Island", -71.4128, 41.8240, True, 2),
    # South Carolina
    ("Columbia", "South Carolina", -81.0348, 34.0007, True, 2),
    ("Charleston", "South Carolina", -79.9311, 32.7765, False, 2),
    ("Greenville", "South Carolina", -82.3940, 34.8526, False, 3),
    # South Dakota
    ("Pierre", "South Dakota", -100.3509, 44.3683, True, 3),
    ("Sioux Falls", "South Dakota", -96.7311, 43.5446, False, 2),
    ("Rapid City", "South Dakota", -103.2310, 44.0805, False, 3),
    # Tennessee
    ("Nashville", "Tennessee", -86.7816, 36.1627, True, 1),
    ("Memphis", "Tennessee", -90.0490, 35.1495, False, 1),
    ("Knoxville", "Tennessee", -83.9207, 35.9606, False, 2),
    ("Chattanooga", "Tennessee", -85.3097, 35.0456, False, 3),
    # Texas
    ("Austin", "Texas", -97.7431, 30.2672, True, 1),
    ("Houston", "Texas", -95.3698, 29.7604, False, 1),
    ("Dallas", "Texas", -96.7970, 32.7767, False, 1),
    ("San Antonio", "Texas", -98.4936, 29.4241, False, 1),
    ("Fort Worth", "Texas", -97.3308, 32.7555, False, 2),
    ("El Paso", "Texas", -106.4850, 31.7619, False, 2),
    # Utah
    ("Salt Lake City", "Utah", -111.8910, 40.7608, True, 1),
    ("Provo", "Utah", -111.6585, 40.2338, False, 3),
    ("Ogden", "Utah", -111.9738, 41.2230, False, 3),
    # Vermont
    ("Montpelier", "Vermont", -72.5754, 44.2601, True, 3),
    ("Burlington", "Vermont", -73.2121, 44.4759, False, 2),
    # Virginia
    ("Richmond", "Virginia", -77.4360, 37.5407, True, 1),
    ("Virginia Beach", "Virginia", -75.9780, 36.8529, False, 2),
    ("Norfolk", "Virginia", -76.2859, 36.8508, False, 3),
    # Washington
    ("Olympia", "Washington", -122.9007, 47.0379, True, 3),
    ("Seattle", "Washington", -122.3321, 47.6062, False, 1),
    ("Spokane", "Washington", -117.4260, 47.6588, False, 2),
    ("Tacoma", "Washington", -122.4443, 47.2529, False, 3),
    # West Virginia
    ("Charleston", "West Virginia", -81.6326, 38.3498, True, 2),
    ("Huntington", "West Virginia", -82.4452, 38.4192, False, 3),
    # Wisconsin
    ("Madison", "Wisconsin", -89.4012, 43.0731, True, 2),
    ("Milwaukee", "Wisconsin", -87.9065, 43.0389, False, 1),
    ("Green Bay", "Wisconsin", -88.0133, 44.5133, False, 3),
    # Wyoming
    ("Cheyenne", "Wyoming", -104.8202, 41.1400, True, 2),
    ("Casper", "Wyoming", -106.3131, 42.8666, False, 3),
    # District of Columbia
    ("Washington", "District of Columbia", -77.0369, 38.9072, True, 1),
]


def main() -> None:
    features = []
    for name, state, lng, lat, capital, tier in CITIES:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": {
                    "name": name,
                    "state": state,
                    "capital": capital,
                    "tier": tier,
                },
            }
        )
    geojson = {"type": "FeatureCollection", "features": features}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(geojson, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} reference cities to {OUT}")


if __name__ == "__main__":
    main()