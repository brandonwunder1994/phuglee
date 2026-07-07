"""Quick read-only check of Request PDFs page state."""
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


def _start_test_server():
    """Serve current code on an ephemeral port so Playwright never hits a stale 8787."""
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


def main() -> int:
    client = app.test_client()
    queue = client.get("/api/portal/pending-pdf-requests").get_json()
    expected_pending = queue.get("total_pending", 0)
    expected_blocked = queue.get("total_blocked", 0)

    server, base = _start_test_server()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(f"{base}/portal/request-pdfs", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3000)

            empty_hidden = page.locator("#request-empty").is_hidden()
            card_hidden = page.locator("#request-card").is_hidden()
            subtitle = page.locator("#page-subtitle").inner_text()
            city = page.locator("#card-city").inner_text() if not card_hidden else ""
            progress = page.locator("#progress-text").inner_text()
            apology_visible = page.locator("#btn-send-apology").is_visible()
            settings_visible = page.locator("#settings-menu .settings-trigger").is_visible()
            confirm_dialog_present = page.locator("#email-confirm-dialog").count() > 0
            lazy_thumb = page.locator("#pdf-thumb-placeholder").is_visible()
            blocked_visible = page.locator("#queue-blocked").is_visible()

            has_work = expected_pending > 0 or expected_blocked > 0
            pending_ui_ok = (
                expected_pending > 0
                and card_hidden is False
                and empty_hidden is True
                and bool(city)
                and (
                    "to send" in progress.lower()
                    or "sent" in progress.lower()
                    or "remaining" in progress.lower()
                )
                and lazy_thumb
            )
            blocked_ui_ok = (
                expected_pending == 0
                and expected_blocked > 0
                and card_hidden is True
                and empty_hidden is False
                and blocked_visible
            )
            ok = has_work and (pending_ui_ok or blocked_ui_ok) and settings_visible and confirm_dialog_present

            result = {
                "pass": ok,
                "expected_pending": expected_pending,
                "expected_blocked": expected_blocked,
                "subtitle": subtitle,
                "empty_hidden": empty_hidden,
                "card_hidden": card_hidden,
                "card_city": city,
                "progress": progress,
                "apology_btn": apology_visible,
                "blocked_visible": blocked_visible,
                "settings_visible": settings_visible,
                "confirm_dialog": confirm_dialog_present,
                "lazy_thumb": lazy_thumb,
                "server": base,
            }
            print("PASS" if ok else "FAIL")
            print(json.dumps(result, indent=2))
            browser.close()
            return 0 if ok else 1
    finally:
        server.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())