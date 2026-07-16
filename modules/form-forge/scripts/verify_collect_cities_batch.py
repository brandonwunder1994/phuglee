"""Verify newly added Collect cities are loadable and queue-eligible."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.portal_registry import (  # noqa: E402
    LEADS_UNAVAILABLE_STATES,
    find_city,
    include_in_city_tracker,
    load_registry,
)
from review_portal.submission_tracker import (  # noqa: E402
    build_pending_online_request_queue,
    is_online_portal_eligible,
)

IDS = [
    "california-los-angeles",
    "tennessee-nashville",
    "wisconsin-green-bay",
    "california-riverside",
    "texas-fort-worth",
    "california-lancaster",
    "california-modesto",
    "oklahoma-oklahoma-city",
    "nevada-north-las-vegas",
    "california-cathedral-city",
    "florida-sarasota",
    "california-san-diego",
    "wisconsin-milwaukee",
    "washington-seattle",
    "illinois-chicago",
]


def main() -> int:
    reg = load_registry()
    print("TN in unavailable?", "Tennessee" in LEADS_UNAVAILABLE_STATES)
    print("city_count", reg["city_count"], "loaded", len(reg["cities"]))
    missing = []
    for city_id in IDS:
        city = find_city(reg, city_id)
        if not city:
            missing.append(city_id)
            continue
        print(
            f"{city_id}: tracker={include_in_city_tracker(city)} "
            f"online_eligible={is_online_portal_eligible(city)} "
            f"url={city.get('portal_url', '')}"
        )
    print("missing", missing)
    queue = build_pending_online_request_queue(reg)
    pending_ids = {item["id"] for item in queue["items"]}
    print("in pending online queue:", sorted(pending_ids & set(IDS)))
    print("NOT in pending:", sorted(set(IDS) - pending_ids))
    return 1 if missing or (set(IDS) - pending_ids) else 0


if __name__ == "__main__":
    raise SystemExit(main())
