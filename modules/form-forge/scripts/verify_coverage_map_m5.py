"""M5 Coverage Map browser verification (embedded test server)."""
from __future__ import annotations

import json
import logging
import sys
import threading
from pathlib import Path

logging.getLogger("werkzeug").setLevel(logging.ERROR)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server

from review_portal.app import app  # noqa: E402
from review_portal.coverage_data import build_coverage_payload  # noqa: E402


def _start_test_server():
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


def _sample_cities():
    payload = build_coverage_payload()
    portal = next(c for c in payload["cities"] if c.get("pin_type") == "portal")
    form = next(c for c in payload["cities"] if c.get("pin_type") == "completed")
    ohio = next(c for c in payload["cities"] if c["state"] == "Ohio")
    return portal, form, ohio


def main() -> int:
    portal, form, ohio = _sample_cities()
    checks: list[dict] = []
    console_errors: list[str] = []

    def record(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"check": name, "pass": ok, "detail": detail})

    server, base = _start_test_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            page.goto(f"{base}/map", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function(
                "() => document.querySelector('.map-canvas-wrap')?.classList.contains('is-ready')",
                timeout=30000,
            )
            page.wait_for_timeout(800)

            record("map loads with is-ready", page.locator(".map-canvas-wrap.is-ready").count() == 1)
            record("loading overlay hidden", page.locator("#map-loading").is_hidden())
            record("map canvas present", page.locator("#map-canvas").count() == 1)
            stats_text = page.locator("#map-stats").inner_text().lower()
            record("hero stat Cities covered", "cities covered" in stats_text)
            record("hero stat Records forms", "records forms" in stats_text)
            record("no stat-exact element", page.locator("#stat-exact").count() == 0)
            record("no legacy tracker link", page.locator("#link-tracker").count() == 0)
            record("no legacy editor link", page.locator("#link-editor").count() == 0)
            record("nav City Tracker link", page.locator('a.nav-link[href="/portal"]').count() == 1)
            record("nav Records via settings", page.locator('a.settings-item[href="/"]').count() == 1)

            # Deep link — portal city
            page.goto(f"{base}/map?city={portal['id']}", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("() => !document.getElementById('sidebar-city')?.hidden", timeout=20000)
            page.wait_for_timeout(600)
            record(
                "deep link opens city card",
                page.locator("#sidebar-city").is_visible(),
                portal["id"],
            )
            record(
                "portal badge",
                "online portal" in page.locator("#city-coverage-badge").inner_text().lower(),
            )
            record(
                "portal availability list",
                page.locator("#city-available li").count() >= 2,
            )
            record(
                "no submission ops copy",
                "submission" not in page.locator("#sidebar-city").inner_text().lower()
                and "last logged" not in page.locator("#sidebar-city").inner_text().lower(),
            )

            # Deep link — completed form city
            page.goto(f"{base}/map?city={form['id']}", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("() => !document.getElementById('sidebar-city')?.hidden", timeout=20000)
            page.wait_for_timeout(600)
            record(
                "form badge",
                "records form" in page.locator("#city-coverage-badge").inner_text().lower(),
            )
            record(
                "form FOIA line",
                "FOIA" in page.locator("#city-available").inner_text(),
            )

            # Search flow
            page.goto(f"{base}/map", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function(
                "() => document.querySelector('.map-canvas-wrap')?.classList.contains('is-ready')",
                timeout=30000,
            )
            page.fill("#map-search", ohio["city"])
            page.wait_for_timeout(400)
            record("search opens results", page.locator("#sidebar-search").is_visible())
            page.locator("#search-city-list button").first.click()
            page.wait_for_timeout(600)
            record("search selects city card", page.locator("#sidebar-city").is_visible())
            record("search city title", ohio["city"] in page.locator("#city-title").inner_text())

            # State drill-down via JS (canvas click is flaky in headless)
            page.goto(f"{base}/map", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function(
                "() => document.querySelector('.map-canvas-wrap')?.classList.contains('is-ready')",
                timeout=30000,
            )
            page.evaluate("name => { if (typeof showState === 'function') showState(name); }", "Ohio")
            page.wait_for_timeout(900)
            record("state drill-down sidebar", page.locator("#sidebar-state").is_visible())
            record("state title Ohio", "Ohio" in page.locator("#state-title").inner_text())
            record("county browser present", page.locator("#state-county-browser .county-browser").count() == 1)

            page.locator("#btn-reset-zoom").click()
            page.wait_for_timeout(900)
            record("full map reset hides sidebar", page.locator("#map-sidebar").get_attribute("aria-hidden") == "true")

            # Mobile viewport
            page.set_viewport_size({"width": 375, "height": 812})
            page.goto(f"{base}/map?city={portal['id']}", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_function("() => !document.getElementById('sidebar-city')?.hidden", timeout=20000)
            page.wait_for_timeout(400)
            search_box = page.locator("#map-search")
            box = search_box.bounding_box()
            record(
                "mobile search touch height",
                box is not None and box["height"] >= 44,
                f"height={box['height'] if box else 'n/a'}",
            )
            record("mobile city card visible", page.locator("#sidebar-city").is_visible())

            record(
                "no console errors",
                len(console_errors) == 0,
                "; ".join(console_errors[:3]),
            )

            browser.close()
    finally:
        server.shutdown()

    failed = [c for c in checks if not c["pass"]]
    result = {"pass": len(failed) == 0, "checks": checks, "failed": len(failed), "total": len(checks)}
    print(json.dumps(result, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())