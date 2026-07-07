"""Read-only browser audit for City Tracker — no submissions or emails."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright

from review_portal.app import app  # noqa: E402
from review_portal.portal_registry import find_city, load_registry  # noqa: E402

BASE = "http://127.0.0.1:8787"
issues: list[str] = []


def wait_portal_ready(page, *, timeout: int = 60000) -> None:
    page.wait_for_selector('[data-portal-ready="1"]', timeout=timeout)


def fail(msg: str) -> None:
    issues.append(msg)


def pick_fixtures() -> dict:
    registry = load_registry()
    client = app.test_client()
    cities = client.get("/api/portal/cities").get_json().get("items", [])
    apology_id = next(
        (c["id"] for c in cities if c.get("apology_email", {}).get("show_button")),
        "",
    )
    online_id = "arizona-avondale"
    if apology_id and not find_city(registry, apology_id):
        apology_id = ""
    if not find_city(registry, online_id):
        online_id = next(
            (
                c["id"]
                for c in registry.get("cities", [])
                if c.get("pathway") == "online" and c.get("portal_url")
            ),
            "",
        )
    return {"apology_id": apology_id, "online_id": online_id}


def main() -> int:
    fixtures = pick_fixtures()
    apology_id = fixtures["apology_id"]
    online_id = fixtures["online_id"]

    if not apology_id:
        fail("No apology-pending city in queue — cannot verify apology UI")
    if not online_id:
        fail("No online portal city found for comparison checks")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        deep_link = f"{BASE}/portal?city={apology_id or online_id}"
        page.goto(deep_link, wait_until="domcontentloaded", timeout=60000)
        wait_portal_ready(page)
        page.wait_for_selector("#city-list button", timeout=60000)

        if not page.locator("h1").filter(has_text="Form Forge").count():
            fail("Page title/brand missing")

        city_buttons = page.locator("#city-list button")
        if city_buttons.count() < 100:
            fail(f"Expected many cities in list, got {city_buttons.count()}")

        if page.locator("#detail-card").is_hidden():
            fail(f"Detail card hidden after deep link to {deep_link}")

        if apology_id:
            page.goto(f"{BASE}/portal?city={apology_id}", wait_until="domcontentloaded", timeout=60000)
            wait_portal_ready(page)
            page.wait_for_selector("#detail-card", state="visible", timeout=60000)
            city_name = page.locator("#detail-city").inner_text()
            raw = find_city(load_registry(), apology_id) or {}
            expected = raw.get("city", "")
            if expected and expected not in city_name:
                fail(f"Wrong apology city selected: {city_name!r}")
            try:
                page.wait_for_selector("#btn-send-apology", state="visible", timeout=15000)
            except Exception:
                fail(f"Apology button not visible for {apology_id}")

        if page.locator("#btn-send-email").count() == 0:
            fail("Send email button missing from DOM")

        if apology_id and page.locator("#pdf-block").is_hidden():
            fail("PDF block hidden for apology completed-PDF city")

        badge = page.locator("#portal-request-pdfs-count")
        if badge.is_hidden():
            fail("Request PDFs badge hidden — expected pending count")
        else:
            count = badge.inner_text().strip()
            if not count.isdigit() or int(count) < 1:
                fail(f"Unexpected pending badge count: {count!r}")

        kpi_sub = page.locator("#kpi-tracker-sub").inner_text()
        if "unavailable" in kpi_sub.lower():
            fail(f"KPI unavailable: {kpi_sub}")

        page.locator("#portal-filter-trigger").click()
        if page.locator("#portal-filter-panel").is_hidden():
            fail("Filter panel did not open")

        count_text = page.locator("#portal-filter-count").inner_text()
        if "cities" not in count_text.lower():
            fail(f"Filter count missing from toolbar: {count_text!r}")

        page.locator("#search-input").fill("Apache")
        page.wait_for_timeout(400)
        if page.locator("#city-list button").count() < 1:
            fail("Search filter returned no cities for 'Apache'")

        filtered_count = page.locator("#portal-filter-count").inner_text()
        if " of " not in filtered_count:
            fail(f"Expected 'N of M cities' after search, got {filtered_count!r}")

        badge = page.locator("#portal-filter-active")
        if badge.is_hidden() or not badge.inner_text().strip().isdigit():
            fail("Active filter count badge not shown after search")

        if page.locator("#portal-filter-clear").is_hidden():
            fail("Clear filters button hidden while filters active")

        page.locator(".portal-filter-chip[data-quick='online']").click()
        page.wait_for_timeout(200)
        if not page.locator(".portal-filter-chip[data-quick='online']").evaluate(
            "el => el.classList.contains('active')"
        ):
            fail("Online quick filter chip did not activate")

        page.locator("#portal-filter-clear").click()
        page.wait_for_timeout(200)
        if " of " in page.locator("#portal-filter-count").inner_text():
            fail("Filter count still shows filtered state after clear")

        if online_id:
            page.goto(f"{BASE}/portal?city={online_id}", wait_until="domcontentloaded", timeout=60000)
            wait_portal_ready(page)
            page.wait_for_selector("#detail-card", state="visible", timeout=60000)
            if page.locator("#btn-send-apology").is_visible():
                fail("Apology button visible for non-apology online city")
            if page.locator("#btn-open-portal").is_hidden():
                fail("Open portal link hidden for online city")

            page.locator("#btn-record-response").click()
            if not page.locator("#response-dialog").is_visible():
                fail("Record response dialog did not open")
            page.locator("#response-cancel").click()

            if page.locator("#btn-send-email").is_visible():
                fail("Send email button visible for online-only city (should be hidden)")

        if page.locator("#email-confirm-dialog").count() == 0:
            fail("Email confirm dialog missing from portal.html")

        if apology_id:
            page.goto(f"{BASE}/portal?city={apology_id}", wait_until="domcontentloaded", timeout=60000)
            wait_portal_ready(page)
            page.wait_for_selector("#btn-preview-pdf", timeout=60000)
            page.locator("#btn-preview-pdf").click()
            if not page.locator("#pdf-preview-dialog").is_visible():
                fail("PDF preview dialog did not open")
            page.locator("#pdf-dialog-close").click()

        if apology_id:
            page.goto(f"{BASE}/portal?quick=apology", wait_until="domcontentloaded", timeout=60000)
            wait_portal_ready(page)
            page.wait_for_selector("#city-list button", timeout=60000)
            page.wait_for_timeout(400)
            apology_count = page.locator("#city-list button").count()
            if apology_count < 1:
                fail("URL quick=apology filter returned no cities")
            if apology_count > 200:
                fail(f"URL quick=apology should narrow list, got {apology_count} cities")
            filtered_label = page.locator("#portal-filter-count").inner_text()
            if " of " not in filtered_label:
                fail(f"URL quick=apology should show filtered count, got {filtered_label!r}")
            if not page.locator(".portal-filter-chip[data-quick='apology']").evaluate(
                "el => el.classList.contains('active')"
            ):
                fail("Apology chip not active after ?quick=apology deep link")
            if "quick=apology" not in page.url:
                fail("URL should retain quick=apology param after load")

        page.goto(f"{BASE}/portal", wait_until="domcontentloaded", timeout=60000)
        wait_portal_ready(page)
        page.wait_for_selector("#city-list button", timeout=60000)
        if page.locator("#city-list button").count() < 2:
            fail("Need at least 2 cities for keyboard navigation test")
        page.locator("#city-list").focus()
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(350)
        first_active = page.locator("#city-list button.active").inner_text()
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(350)
        second_active = page.locator("#city-list button.active").inner_text()
        if first_active == second_active:
            fail("ArrowDown did not advance city list selection")
        if "city=" not in page.url:
            fail("URL should include city param after keyboard selection")

        page.goto(f"{BASE}/portal", wait_until="domcontentloaded", timeout=60000)
        page.evaluate("window.PortalShared.showToast('Audit toast check', { ok: false, duration: 8000 })")
        page.wait_for_selector(".portal-toast.err", timeout=5000)
        if not page.locator(".portal-toast-root").count():
            fail("portal-toast-root missing after showToast")

        browser.close()

    print(json.dumps({"issues": issues, "passed": len(issues) == 0, "fixtures": fixtures}, indent=2))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())