from playwright.sync_api import sync_playwright
import json
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    page = context.new_page()
    t0 = time.perf_counter()
    page.goto("http://localhost:3000/analyzer", wait_until="domcontentloaded", timeout=60000)
    page.evaluate("() => sessionStorage.setItem('phuglee_session', 'admin')")
    page.reload(wait_until="domcontentloaded", timeout=60000)
    page.wait_for_function(
        "() => document.querySelectorAll('#cardsGrid .prop-card').length >= 30",
        timeout=120000,
    )
    cards_ms = round((time.perf_counter() - t0) * 1000)
    thumbs_loaded = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('#cardsGrid .prop-card .card-thumb img')];
      return {
        total: imgs.length,
        loaded: imgs.filter(i => i.classList.contains('loaded') || (i.complete && i.naturalWidth > 0)).length,
        eager: imgs.filter(i => i.getAttribute('loading') === 'eager').length,
        animNone: getComputedStyle(document.querySelector('#cardsGrid .prop-card')).animationName === 'none'
      };
    }""")
    metrics = page.evaluate("""() => {
      const loadBtn = document.getElementById('resultsLoadMoreBtn');
      return {
        cardCount: document.querySelectorAll('#cardsGrid .prop-card').length,
        loadMoreBtnText: loadBtn?.textContent?.trim() || null,
        resultsLen: window.PDA?.env?.state?.results?.length ?? null
      };
    }""")
    metrics["cardsVisibleMs"] = cards_ms
    metrics.update(thumbs_loaded)
    print(json.dumps(metrics, indent=2), flush=True)
    browser.close()