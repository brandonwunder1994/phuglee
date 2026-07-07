"""Read-only audit of City Tracker page APIs and data consistency."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from review_portal.app import app  # noqa: E402
from review_portal.apology_email import show_apology_button  # noqa: E402
from review_portal.portal_registry import (  # noqa: E402
    city_has_completed_pdf,
    find_city,
    include_in_city_tracker,
    list_city_tracker_cities,
    load_registry,
)

REQUIRED_CITY_KEYS = {
    "id",
    "city",
    "state",
    "pathway",
    "contact_email",
    "tracking",
    "apology_email",
    "requests",
    "submissions",
    "pdf",
}
REQUIRED_TRACKING_KEYS = {"email", "online", "request_type"}
REQUIRED_EMAIL_TRACKING_KEYS = {"can_send", "state", "sent_label", "blocked_reason"}
REQUIRED_SUMMARY_KEYS = {
    "id",
    "city",
    "state",
    "pathway",
    "is_email_only",
    "lacks_portal_and_email",
    "has_completed_pdf",
    "cv_response_status",
    "apology_email",
    "contact_email_wrong",
}
PORTAL_HTML = ROOT / "review_portal" / "static" / "portal.html"
PORTAL_JS = ROOT / "review_portal" / "static" / "portal.js"

issues: list[str] = []
warnings: list[str] = []


def issue(msg: str) -> None:
    issues.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def check(condition: bool, msg: str, *, warning: bool = False) -> None:
    if not condition:
        (warn if warning else issue)(msg)


def ids_in_html(html: str) -> set[str]:
    return set(re.findall(r'id="([^"]+)"', html))


def ids_referenced_in_js(js: str) -> set[str]:
    refs = set(re.findall(r'\$\("#([^"]+)"\)', js))
    refs.update(re.findall(r'getElementById\("([^"]+)"\)', js))
    return refs


def audit_static_wiring() -> None:
    html = PORTAL_HTML.read_text(encoding="utf-8")
    js = PORTAL_JS.read_text(encoding="utf-8")
    html_ids = ids_in_html(html)
    js_refs = ids_referenced_in_js(js)
    missing = sorted(js_refs - html_ids)
    check(not missing, f"portal.js references missing DOM ids: {missing[:15]}{'…' if len(missing) > 15 else ''}")
    check("/api/portal/cities/summary" in js, "portal.js should fetch /api/portal/cities/summary")
    check("/api/portal/city/" in js, "portal.js should fetch city detail on demand")
    check("/api/portal/kpi" in js, "portal.js should fetch /api/portal/kpi")
    check("/api/portal/pending-pdf-requests" in js, "portal.js should fetch pending PDF badge endpoint")
    check("apology_email" in js, "portal.js should handle apology_email.show_button")
    check("portal-shared.js" in html, "portal.html should load portal-shared.js")
    check("PortalShared" in js, "portal.js should use PortalShared utilities")
    check("mergeSummaryFromDetail" in js, "portal.js should merge detail back into summary cache")
    check("showToast" in (ROOT / "review_portal" / "static" / "portal-shared.js").read_text(encoding="utf-8"), "portal-shared.js should define showToast")
    check("readFiltersFromUrl" in js, "portal.js should read filters from URL")
    check("bindCityListKeyboard" in js, "portal.js should bind city list keyboard navigation")
    check('tabindex="0"' in html or "tabindex=\"0\"" in html, "portal.html city list should be keyboard focusable")
    check(PORTAL_HTML.exists(), "portal.html missing")
    check((ROOT / "review_portal" / "static" / "portal.css").exists(), "portal.css missing")
    check((ROOT / "review_portal" / "static" / "portal-shared.js").exists(), "portal-shared.js missing")


def audit_city_payload(city: dict, registry: dict) -> None:
    cid = city.get("id", "")
    missing_keys = REQUIRED_CITY_KEYS - set(city.keys())
    check(not missing_keys, f"{cid}: portal payload missing keys {sorted(missing_keys)}")

    tracking = city.get("tracking") or {}
    missing_tracking = REQUIRED_TRACKING_KEYS - set(tracking.keys())
    check(not missing_tracking, f"{cid}: tracking missing keys {sorted(missing_tracking)}")

    email_tracking = tracking.get("email") or {}
    missing_email = REQUIRED_EMAIL_TRACKING_KEYS - set(email_tracking.keys())
    check(not missing_email, f"{cid}: tracking.email missing keys {sorted(missing_email)}")

    apology = city.get("apology_email") or {}
    check(
        "show_button" in apology and "sent_at" in apology,
        f"{cid}: apology_email missing show_button/sent_at",
    )

    raw_city = find_city(registry, cid)
    if raw_city:
        expected = show_apology_button(raw_city)
        actual = bool(apology.get("show_button"))
        check(
            expected == actual,
            f"{cid}: apology show_button mismatch api={actual} expected={expected}",
        )

    if city_has_completed_pdf(city):
        url = city.get("pdf_file_url", "")
        check(url.startswith("/api/file/"), f"{cid}: invalid pdf_file_url {url!r}")
        rel = url.replace("/api/file/", "")
        disk = ROOT / rel
        check(disk.exists(), f"{cid}: completed PDF missing on disk: {rel}", warning=True)


def audit_get_routes(client) -> dict:
    routes = [
        ("/portal", 200),
        ("/portal/request-pdfs", 200),
        ("/static/portal.js?v=21", 200),
        ("/static/portal.css?v=16", 200),
        ("/api/portal/cities", 200),
        ("/api/portal/cities/summary", 200),
        ("/api/portal/kpi", 200),
        ("/api/portal/pending-pdf-requests", 200),
        ("/api/portal/submissions", 200),
        ("/api/portal/cv-tracker", 200),
        ("/api/portal/turnaround", 200),
    ]
    results = {}
    for path, expected_status in routes:
        res = client.get(path)
        check(
            res.status_code == expected_status,
            f"GET {path} returned {res.status_code}, expected {expected_status}",
        )
        results[path] = res
    return results


def audit_cities_summary(data: dict, *, full_payload_bytes: int) -> None:
    items = data.get("items") or []
    check(isinstance(items, list) and items, "summary list is empty")
    check(data.get("total") == len(items), f"summary total mismatch: header={data.get('total')} items={len(items)}")
    for city in items[:20]:
        missing = REQUIRED_SUMMARY_KEYS - set(city.keys())
        check(not missing, f"{city.get('id')}: summary missing keys {sorted(missing)}")
        apology = city.get("apology_email") or {}
        check(
            set(apology.keys()) <= {"show_button"},
            f"{city.get('id')}: summary apology_email should only expose show_button",
        )

    summary_bytes = len(json.dumps(data, separators=(",", ":")).encode("utf-8"))
    check(
        summary_bytes < full_payload_bytes,
        f"summary payload ({summary_bytes} bytes) should be smaller than full cities ({full_payload_bytes} bytes)",
    )
    ratio = summary_bytes / full_payload_bytes if full_payload_bytes else 1
    if ratio > 0.5:
        warn(f"summary payload is {ratio:.0%} of full cities — expected a larger gap")


def audit_cities_list(data: dict, registry: dict) -> None:
    items = data.get("items") or []
    check(isinstance(items, list) and items, "cities list is empty")
    check(data.get("total") == len(items), f"total mismatch: header={data.get('total')} items={len(items)}")

    ids = [c.get("id") for c in items]
    check(len(ids) == len(set(ids)), "duplicate city ids in /api/portal/cities")

    from review_portal.apology_email import load_apology_queue, show_apology_button

    apology_queue = load_apology_queue()
    eligible_apology_ids = [
        cid
        for cid in (apology_queue.get("pending") or [])
        if show_apology_button(find_city(registry, cid) or {}, queue=apology_queue)
    ]
    apology_count = sum(1 for c in items if c.get("apology_email", {}).get("show_button"))
    if eligible_apology_ids:
        check(
            apology_count > 0,
            "eligible apology cities exist but none show apology button in cities list",
        )
    elif apology_queue.get("pending"):
        warn(
            f"apology queue has {len(apology_queue['pending'])} cities but none are send-ready "
            "(missing email, invalid email, or incomplete PDF)"
        )

    online = [c for c in items if c.get("pathway") == "online" and c.get("portal_url")]
    pdf_email = [c for c in items if c.get("pathway") == "email_pdf"]
    check(online, "no online portal cities in tracker list", warning=True)
    check(pdf_email, "no email_pdf cities in tracker list", warning=True)

    for city in items:
        audit_city_payload(city, registry)
        check(include_in_city_tracker(find_city(registry, city["id"]) or {}), f"{city['id']}: should be excluded from tracker")


def audit_city_detail(client, city_id: str, registry: dict) -> None:
    res = client.get(f"/api/portal/city/{city_id}")
    check(res.status_code == 200, f"GET /api/portal/city/{city_id} returned {res.status_code}")
    payload = res.get_json()
    audit_city_payload(payload, registry)


def audit_kpi(data: dict) -> None:
    for key in ("current_month", "current_month_label", "current_month_email_sent", "months"):
        check(key in data, f"kpi missing key {key}")
    months = data.get("months") or []
    check(isinstance(months, list), "kpi months is not a list")


def audit_pending_queue(data: dict) -> None:
    for key in (
        "current_month",
        "current_month_label",
        "total_pending",
        "total_apology_pending",
        "total_blocked",
        "items",
        "blocked",
    ):
        check(key in data, f"pending-pdf-requests missing key {key}")

    items = data.get("items") or []
    apology_items = [i for i in items if i.get("apology_email", {}).get("show_button")]
    check(
        data.get("total_apology_pending") == len(apology_items),
        "total_apology_pending does not match items with show_button",
    )
    check(data.get("total_pending") == len(items), "total_pending does not match items length")

    for item in items[:5]:
        check(item.get("contact_email"), f"{item.get('id')}: pending queue item missing contact_email")
        check(item.get("pdf_file_url"), f"{item.get('id')}: pending queue item missing pdf_file_url")


def audit_button_logic(registry: dict) -> None:
    cities = list_city_tracker_cities(registry)
    for city in cities[:50]:
        has_pdf = city_has_completed_pdf(city)
        pathway = city.get("pathway", "online")
        has_email = bool((city.get("contact_email") or "").strip())
        has_portal = bool((city.get("portal_url") or "").strip())

        if pathway == "email_pdf" and has_pdf and has_email:
            # Email button should be eligible in UI
            pass
        if pathway == "online" and has_portal:
            # Online submit should be eligible
            pass

    # Sample apology city must show apology in payload (dynamic fixture from queue)
    from review_portal.apology_email import load_apology_queue
    from review_portal.submission_tracker import portal_city_payload

    apology_pending = load_apology_queue().get("pending") or []
    sample_id = apology_pending[0] if apology_pending else ""
    sample = find_city(registry, sample_id) if sample_id else None
    if sample:
        apology_queue = load_apology_queue()
        expected = show_apology_button(sample, queue=apology_queue)
        payload = portal_city_payload(sample, registry=registry, apology_queue=apology_queue)
        check(
            payload.get("apology_email", {}).get("show_button") is expected,
            f"sample apology city {sample_id} show_button mismatch "
            f"(api={payload.get('apology_email', {}).get('show_button')} expected={expected})",
        )
        if not expected:
            warn(
                f"sample apology city {sample_id} is queued but blocked from sending "
                f"(invalid/missing email or incomplete PDF)"
            )
    else:
        warn("no cities in apology pending queue — skipping apology button sample check")


def main() -> int:
    registry = load_registry()
    client = app.test_client()

    print("Auditing static wiring…")
    audit_static_wiring()

    print("Auditing GET routes…")
    route_results = audit_get_routes(client)

    print("Auditing /api/portal/cities…")
    cities_data = route_results["/api/portal/cities"].get_json()
    full_payload_bytes = len(
        route_results["/api/portal/cities"].get_data(as_text=False)
    )
    audit_cities_list(cities_data, registry)

    print("Auditing /api/portal/cities/summary…")
    summary_data = route_results["/api/portal/cities/summary"].get_json()
    audit_cities_summary(summary_data, full_payload_bytes=full_payload_bytes)
    check(
        summary_data.get("total") == cities_data.get("total"),
        "summary total does not match full cities total",
    )

    print("Auditing city detail samples…")
    from review_portal.apology_email import load_apology_queue

    apology_pending = load_apology_queue().get("pending") or []
    sample_ids = []
    if apology_pending:
        sample_ids.append(apology_pending[0])
    sample_ids.append("arizona-avondale")
    for cid in sample_ids:
        if find_city(registry, cid):
            audit_city_detail(client, cid, registry)

    print("Auditing KPI + pending queue…")
    audit_kpi(route_results["/api/portal/kpi"].get_json())
    audit_pending_queue(route_results["/api/portal/pending-pdf-requests"].get_json())

    print("Auditing button logic…")
    audit_button_logic(registry)

    print()
    print(f"Issues: {len(issues)}")
    for item in issues:
        print(f"  [FAIL] {item}")
    print(f"Warnings: {len(warnings)}")
    for item in warnings:
        print(f"  [WARN] {item}")

    summary = {
        "issues": issues,
        "warnings": warnings,
        "cities_total": cities_data.get("total"),
        "summary_bytes": len(
            json.dumps(summary_data, separators=(",", ":")).encode("utf-8")
        ),
        "full_cities_bytes": full_payload_bytes,
        "apology_cities": sum(
            1 for c in (cities_data.get("items") or []) if c.get("apology_email", {}).get("show_button")
        ),
        "pending_pdf_total": route_results["/api/portal/pending-pdf-requests"].get_json().get("total_pending"),
    }
    print()
    print(json.dumps(summary, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())