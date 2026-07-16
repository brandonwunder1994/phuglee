"""One-shot: add Collect portal cities from operator-provided FOIA URLs."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import REGISTRY_PATH, save_registry, slugify  # noqa: E402


def make_city(city: str, state: str, portal_url: str, *, url_notes: str = "") -> dict:
    return {
        "id": slugify(state, city),
        "city": city,
        "state": state,
        "pathway": "online",
        "portal_url": portal_url,
        "contact_email": "",
        "url_notes": url_notes,
        "form_type": "Online",
        "requests": {
            "water_shutoff": {
                "requested": False,
                "response_status": "pending",
                "response_raw": "",
            },
            "code_violation": {
                "requested": False,
                "requested_at": "",
                "response_status": "pending",
                "response_raw": "",
            },
        },
        "submissions": [],
    }


def main() -> None:
    raw = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in raw.get("cities", [])}

    # Session tokens stripped from GovQA/MyCustHelp URLs for stable bookmarks.
    additions = [
        make_city("Los Angeles", "California", "https://recordsrequest.lacity.org/"),
        make_city("Nashville", "Tennessee", "https://nashvilletn.govqa.us/WEBAPP/_rs/"),
        make_city(
            "Green Bay",
            "Wisconsin",
            "https://www.greenbaywi.gov/FormCenter/Law-4/Public-Records-Request-43",
        ),
        make_city("Riverside", "California", "https://riversideca.mycusthelp.com/WEBAPP/_rs/"),
        make_city("Fort Worth", "Texas", "https://fortworth.govqa.us/WEBAPP/_rs/"),
        make_city(
            "Lancaster",
            "California",
            "https://cityoflancasterca.justfoia.com/publicportal/home/newrequest",
        ),
        make_city(
            "Modesto",
            "California",
            "https://cityofmodestoca.nextrequest.com/requests/new",
        ),
        make_city(
            "Oklahoma City",
            "Oklahoma",
            "https://oklahomacityok.justfoia.com/Forms/Launch/d705cbd6-1396-49b7-939e-8d86c5a87deb",
        ),
        # SurveyGizmo form is City of North Las Vegas (not Las Vegas proper).
        make_city(
            "North Las Vegas",
            "Nevada",
            "https://www.surveygizmo.com/s3/5736794/Public-Records-Act-Request-Form-07-2020",
            url_notes="North Las Vegas PRA form (SurveyGizmo)",
        ),
        make_city(
            "Cathedral City",
            "California",
            "https://cathedralcityca.nextrequest.com/requests/new",
        ),
        make_city(
            "Sarasota",
            "Florida",
            "https://sarasotafl.justfoia.com/publicportal/home/newrequest",
        ),
        make_city("San Diego", "California", "https://sandiego.nextrequest.com/"),
        make_city(
            "Milwaukee",
            "Wisconsin",
            "https://aca-prod.accela.com/MILWAUKEE/Default.aspx",
            url_notes="Accela Citizen Access — confirm FOIA/records path vs permits",
        ),
        make_city("Seattle", "Washington", "https://city-seattle.mycusthelp.com/webapp/_rs/"),
        make_city("Chicago", "Illinois", "https://chicagoil.govqa.us/WEBAPP/_rs/"),
    ]

    added: list[str] = []
    updated: list[str] = []
    for city in additions:
        existing = by_id.get(city["id"])
        if existing:
            existing["portal_url"] = city["portal_url"]
            existing["pathway"] = "online"
            existing["form_type"] = existing.get("form_type") or "Online"
            if city.get("url_notes") and not existing.get("url_notes"):
                existing["url_notes"] = city["url_notes"]
            by_id[city["id"]] = existing
            updated.append(city["id"])
        else:
            by_id[city["id"]] = city
            added.append(city["id"])

    cities = sorted(by_id.values(), key=lambda c: (c["state"], c["city"]))
    raw["cities"] = cities
    raw["city_count"] = len(cities)
    save_registry(raw)
    print(f"added={len(added)} {added}")
    print(f"updated={len(updated)} {updated}")
    print(f"city_count={raw['city_count']}")


if __name__ == "__main__":
    main()
