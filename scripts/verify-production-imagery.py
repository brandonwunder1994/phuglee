"""Verify Street View thumbnails load on live Railway Analyzer page."""
from playwright.sync_api import sync_playwright

URL = "https://phuglee-production.up.railway.app/analyzer/"
TIMEOUT_MS = 120000


def main():
    results = {
        "config_ok": False,
        "console_imagery_log": False,
        "workspace_visible": False,
        "cards_found": 0,
        "imgs_with_src": 0,
        "imgs_loaded": 0,
        "sv_image_requests": 0,
        "cached_404_requests": 0,
        "sample_srcs": [],
        "page_title": "",
        "body_snippet": "",
        "errors": [],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        sv_requests = []
        cached_requests = []

        def on_response(resp):
            u = resp.url
            if "/api/sv-image" in u:
                sv_requests.append({"url": u[:140], "status": resp.status})
            if "/api/cached-imagery/streetview/" in u:
                cached_requests.append({"url": u[:140], "status": resp.status})

        page.on("response", on_response)

        console_msgs = []
        page.on("console", lambda msg: console_msgs.append(msg.text))

        try:
            # Match auth-disabled production default (admin scope = seeded session)
            page.add_init_script("""
              try {
                sessionStorage.setItem('phuglee_session', 'admin');
              } catch (_) {}
            """)
            page.goto(URL, wait_until="networkidle", timeout=TIMEOUT_MS)
            results["page_title"] = page.title()

            # Click restore if empty workspace shows
            restore = page.locator(
                "#restoreSessionBtn, #emptyRestoreBtn, button:has-text('Restore'), "
                "[data-action='restore-session']"
            )
            if restore.count() > 0:
                try:
                    restore.first.click(timeout=5000)
                    page.wait_for_timeout(2000)
                except Exception:
                    pass

            # Wait for main workspace
            try:
                page.wait_for_selector("#mainWorkspace.visible, .main-workspace.visible", timeout=30000)
                results["workspace_visible"] = True
            except Exception:
                # fallback: any results grid
                page.wait_for_selector("#cardsGrid, .cards-grid", timeout=60000)
                results["workspace_visible"] = True

            # Wait for session summary / results to hydrate
            page.wait_for_timeout(5000)

            config = page.evaluate("""async () => {
              const r = await fetch('/analyzer/api/config');
              return r.json();
            }""")
            results["config_ok"] = bool(config.get("hasMapsKey"))

            results["console_imagery_log"] = any(
                "Server maps key ready" in m or "card previews use" in m
                for m in console_msgs
            )

            # Scroll to trigger lazy thumb loads
            page.evaluate("window.scrollTo(0, 400)")
            page.wait_for_timeout(6000)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(4000)

            cards = page.locator(".prop-card")
            results["cards_found"] = cards.count()

            imgs = page.locator(".prop-card .card-thumb img, .card-thumb img")
            n = imgs.count()
            for i in range(min(n, 16)):
                img = imgs.nth(i)
                src = img.get_attribute("src") or ""
                visible = img.is_visible()
                if not src and not visible:
                    continue
                if src:
                    results["imgs_with_src"] += 1
                    if len(results["sample_srcs"]) < 5:
                        results["sample_srcs"].append(src[:180])
                try:
                    loaded = img.evaluate(
                        "el => el.complete && el.naturalWidth > 0"
                    )
                    if loaded:
                        results["imgs_loaded"] += 1
                except Exception as e:
                    results["errors"].append(str(e))

            results["body_snippet"] = page.locator("body").inner_text()[:400].replace("\n", " ")

            page.screenshot(
                path=r"C:\Users\brand\Projects\distress-os\scripts\verify-imagery-production.png",
                full_page=False,
            )

            results["sv_image_requests"] = len(sv_requests)
            results["cached_404_requests"] = sum(
                1 for r in cached_requests if r["status"] == 404
            )
            results["sv_200"] = sum(1 for r in sv_requests if r["status"] == 200)
            results["sv_sample"] = sv_requests[:4]
            results["cached_sample"] = cached_requests[:4]
            results["console_sample"] = [m for m in console_msgs if "Imagery" in m or "Config" in m][:5]

        except Exception as e:
            results["errors"].append(str(e))
            try:
                results["body_snippet"] = page.locator("body").inner_text()[:500].replace("\n", " ")
            except Exception:
                pass
            page.screenshot(
                path=r"C:\Users\brand\Projects\distress-os\scripts\verify-imagery-production-error.png",
                full_page=True,
            )
        finally:
            browser.close()

    print("=== Production Imagery Verification ===")
    for k, v in results.items():
        print(f"{k}: {v}")

    ok = (
        results["config_ok"]
        and results["cards_found"] > 0
        and results["imgs_loaded"] > 0
        and results.get("sv_200", 0) > 0
    )
    print(f"\nPASS: {ok}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())