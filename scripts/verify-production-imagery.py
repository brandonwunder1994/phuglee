"""Verify Street View thumbnails load on live Railway Analyzer page."""
import time
from playwright.sync_api import sync_playwright

URL = "https://phuglee-production.up.railway.app/analyzer/"
TIMEOUT_MS = 120000
MAX_GOTO_ATTEMPTS = 4


def goto_with_retry(page, url, timeout_ms):
    """Railway can return 502 briefly during redeploys — retry before failing."""
    last_err = None
    for attempt in range(1, MAX_GOTO_ATTEMPTS + 1):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            title = page.title()
            body = page.locator("body").inner_text()[:200].lower()
            if "502" in title.lower() or "bad gateway" in body or "application failed to respond" in body:
                raise RuntimeError(f"Railway 502 (attempt {attempt}/{MAX_GOTO_ATTEMPTS})")
            page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 45000))
            return attempt
        except Exception as err:
            last_err = err
            if attempt < MAX_GOTO_ATTEMPTS:
                time.sleep(12 * attempt)
    raise last_err


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
            results["goto_attempts"] = goto_with_retry(page, URL, TIMEOUT_MS)
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

            # Cards live under Lead Rankings — Overview may show empty import prompt
            leads_nav = page.locator('[data-nav="leads"], button:has-text("Lead Rankings")')
            if leads_nav.count() > 0:
                try:
                    leads_nav.first.click(timeout=5000)
                    page.wait_for_timeout(3000)
                except Exception:
                    pass

            config = page.evaluate("""async () => {
              const r = await fetch('/analyzer/api/config');
              return r.json();
            }""")
            results["config_ok"] = bool(config.get("hasMapsKey"))

            results["console_imagery_log"] = any(
                "Server maps key ready" in m or "card previews use" in m
                for m in console_msgs
            )

            # Scroll to trigger lazy thumb loads (virtual scroll + intersection observer)
            for y in [0, 300, 600, 900, 1200, 0]:
                page.evaluate(f"window.scrollTo(0, {y})")
                page.wait_for_timeout(2500)

            # Wait for thumbs to paint (virtual scroll may load many sv-image requests)
            for _ in range(40):
                loaded = page.evaluate("""() => {
                  const imgs = [...document.querySelectorAll('.prop-card .card-thumb img')];
                  return imgs.filter(el => el.complete && el.naturalWidth > 0).length;
                }""")
                if loaded >= 12:
                    break
                page.wait_for_timeout(1000)
                page.evaluate("window.scrollBy(0, 350)")

            cards = page.locator(".prop-card")
            results["cards_found"] = cards.count()

            thumb_info = page.evaluate("""() => {
              const imgs = [...document.querySelectorAll('.prop-card .card-thumb img')];
              return imgs.slice(0, 20).map(el => ({
                src: el.getAttribute('src') || '',
                thumbSrc: el.dataset.thumbSrc || '',
                pending: el.dataset.thumbPending || '',
                loaded: el.dataset.thumbLoaded || '',
                complete: !!(el.complete && el.naturalWidth > 0),
                naturalWidth: el.naturalWidth || 0
              }));
            }""")
            results["thumb_info"] = thumb_info

            for info in thumb_info:
                src = info.get("src") or info.get("thumbSrc") or ""
                if src:
                    results["imgs_with_src"] += 1
                    if len(results["sample_srcs"]) < 5:
                        results["sample_srcs"].append(src[:180])
                if info.get("complete"):
                    results["imgs_loaded"] += 1

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

    transient = any(
        "502" in str(e).lower() or "bad gateway" in str(e).lower()
        for e in results.get("errors", [])
    )
    # Require most visible thumbs to actually paint — lazy-load bugs used to pass with only 6/20.
    min_loaded = max(12, min(results["imgs_with_src"], results["cards_found"]) // 2)
    ok = (
        results["config_ok"]
        and results["cards_found"] > 0
        and results["imgs_loaded"] >= min_loaded
        and results.get("sv_200", 0) >= min_loaded
    )
    results["min_loaded_required"] = min_loaded
    print(f"\nPASS: {ok}")
    if not ok and transient:
        print("NOTE: Failure looks like a transient Railway 502/redeploy — retry in ~60s.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())