# Dashboard Coverage Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/command` (Dashboard) mission board with a coverage-only snapshot: twin live city/state counts plus quiet deep links.

**Architecture:** Rewrite the three command surface files only. Keep `#command-city-count` and `#command-state-count` so existing `home-coverage.js` continues to fill real numbers from `/forge/api/coverage`. Slim `command-center.js` to shell-loading hide + Contracts role gate. No backend changes.

**Tech Stack:** Vanilla HTML/CSS/JS, Phuglee tokens (`public/css/tokens.css`), shell-bundle, Node test runner (`node:test`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-dashboard-coverage-snapshot-design.md`
- Real metrics only; never invent city/state counts or deal KPIs
- No deal/funding strip, no module health block, no mission board, no first-run checklist, no pipeline pulse, no tools chip farm
- Keep auth guard, shell nav/footer mounts, `home-coverage.js` script include
- Preserve IDs: `command-city-count`, `command-state-count`
- Filter href: `/filter` (canonical)
- Contracts: `/under-contract` with existing `data-admin-only` + role gate
- Visual bans: side-stripe borders, gradient text, 4-up equal KPI card grid, glassmorphism stack, Anton marketing hero
- Product tokens only: dark earth, cream, gold accent on cities number
- After site edits: `scripts\verify-live.ps1` exit 0; also mobile verify for `/command`
- Never wipe filter-lists / bridge-brain / forge data / analyzer users

---

## File map

| File | Responsibility |
|------|----------------|
| `public/command.html` | Snapshot markup; drop mission board DOM |
| `public/css/command-center.css` | Twin-hero + quiet link row styles only |
| `public/js/command-center.js` | hideShellLoading + revealAdminTools only |
| `tests/command-dashboard.test.js` | Structural + anti-regression assertions |
| `public/js/home-coverage.js` | **Do not modify** (already targets command IDs) |

---

### Task 1: Structural tests for coverage snapshot

**Files:**
- Create: `tests/command-dashboard.test.js`

**Interfaces:**
- Consumes: `public/command.html`, `public/js/command-center.js`, `public/css/command-center.css` as static files
- Produces: failing tests that define the target shape (TDD)

- [ ] **Step 1: Write the test file**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

function read(rel) {
  return fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
}

test('command.html is coverage snapshot with live count IDs', () => {
  const html = read('command.html');
  assert.ok(html.includes('id="main"'));
  assert.ok(html.includes('id="command-city-count"'));
  assert.ok(html.includes('id="command-state-count"'));
  assert.ok(html.includes('home-coverage.js'));
  assert.ok(html.includes('href="/collect"'));
  assert.ok(html.includes('href="/filter"'));
  assert.ok(html.includes('href="/analyzer/"'));
  assert.ok(html.includes('href="/under-contract"'));
  assert.ok(html.includes('data-admin-only'));
  assert.ok(html.includes('meta name="description"'));
  assert.ok(html.includes('id="main"'));
});

test('command.html has no mission board / pulse / checklist / tools farm', () => {
  const html = read('command.html');
  assert.ok(!html.includes('command-mission-title'));
  assert.ok(!html.includes('command-first-run'));
  assert.ok(!html.includes('command-pulse'));
  assert.ok(!html.includes('command-tools'));
  assert.ok(!html.includes('command-forge-status'));
  assert.ok(!html.includes('Mission Board'));
  assert.ok(!html.includes('btn-how-it-works-dashboard'));
});

test('command-center.js is slim (no health poll / mission focus)', () => {
  const js = read('js/command-center.js');
  assert.ok(js.includes('hideShellLoading') || js.includes('PhugleeStates'));
  assert.ok(js.includes('data-admin-only') || js.includes('revealAdminTools') || js.includes('isContractDesk'));
  assert.ok(!js.includes('pollHealth'));
  assert.ok(!js.includes('updateMissionFocus'));
  assert.ok(!js.includes('initFirstRunChecklist'));
  assert.ok(!js.includes('/api/health'));
});

test('command-center.css targets snapshot classes', () => {
  const css = read('css/command-center.css');
  assert.ok(css.includes('command-snapshot') || css.includes('command-metrics'));
  assert.ok(css.includes('command-city-count') || css.includes('command-metric'));
  assert.ok(!css.includes('command-pulse-node'));
  assert.ok(!css.includes('command-mission-focus'));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run from project root:

```bash
node --test tests/command-dashboard.test.js
```

Expected: FAIL (current HTML still has Mission Board / mission IDs; JS still has pollHealth).

- [ ] **Step 3: Commit tests only**

```bash
git add tests/command-dashboard.test.js
git commit -m "test(dashboard): coverage snapshot structure assertions"
```

---

### Task 2: Rewrite `command.html` main content

**Files:**
- Modify: `public/command.html`

**Interfaces:**
- Consumes: shell mounts, auth scripts, `home-coverage.js` fill of `#command-city-count` / `#command-state-count`
- Produces: snapshot DOM that Task 1 HTML tests expect

- [ ] **Step 1: Replace full file content with:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phuglee — Dashboard</title>
  <meta name="description" content="Live coverage snapshot — cities and states with clerk footprint at a glance.">
  <meta property="og:title" content="Phuglee — Dashboard">
  <meta property="og:description" content="Live coverage snapshot — cities and states with clerk footprint at a glance.">
  <meta property="og:type" content="website">
  <meta property="og:image" content="/images/phuglee-logo-hd.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Phuglee — Dashboard">
  <meta name="twitter:description" content="Live coverage snapshot — cities and states with clerk footprint at a glance.">
  <script src="/js/theme.js?v=distress2"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/shell-bundle.css?v=5">
  <link rel="stylesheet" href="/css/command-center.css?v=8">
  <script src="/js/auth-session.js"></script>
  <script src="/js/auth-config.js"></script>
  <script src="/js/auth-guard.js"></script>
</head>
<body class="phuglee-app has-premium-bg command-page">
  <a href="#main" class="phuglee-skip-link">Skip to content</a>
  <div class="phuglee-shell-bg phuglee-shell-bg--subtle" aria-hidden="true"></div>

  <div id="distress-os-nav-mount"></div>

  <main id="main" class="command-main command-page-ready">
    <div class="command-hub">
      <header class="command-snapshot-head">
        <h1 class="command-snapshot-title">Coverage</h1>
        <p class="command-snapshot-lead">Live clerk footprint</p>
      </header>

      <section
        class="command-metrics"
        aria-label="Live coverage counts"
        aria-live="polite"
      >
        <div class="command-metric">
          <p class="command-metric-value command-metric-value--gold" id="command-city-count">—</p>
          <p class="command-metric-label">cities live</p>
        </div>
        <div class="command-metric-divider" aria-hidden="true"></div>
        <div class="command-metric">
          <p class="command-metric-value" id="command-state-count">—</p>
          <p class="command-metric-label">states</p>
        </div>
      </section>

      <p class="command-coverage-status" id="command-coverage-status" hidden>Coverage unavailable</p>

      <nav class="command-quiet-links" aria-label="Pipeline">
        <a href="/collect" class="command-quiet-link">Collect</a>
        <a href="/filter" class="command-quiet-link">Filter</a>
        <a href="/analyzer/" class="command-quiet-link">Analyze</a>
        <a href="/under-contract" class="command-quiet-link" data-admin-only hidden>Contracts</a>
      </nav>
    </div>
  </main>

  <div id="distress-os-footer-mount"></div>
  <script src="/js/phuglee-motion.js" defer></script>
  <script src="/js/phuglee-states.js" defer></script>
  <script src="/js/home-coverage.js?v=2" defer></script>
  <script src="/js/settings-menu.js?v=4" defer></script>
  <script src="/js/command-palette.js" defer></script>
  <script src="/js/distress-status.js" defer></script>
  <script src="/js/shell-nav.js?v=19" defer></script>
  <script src="/js/team-alert-banner.js?v=1" defer></script>
  <script src="/js/command-center.js?v=6" defer></script>
</body>
</html>
```

Notes for implementer:
- Drop Anton font import (product UI — Outfit + mono only).
- Bump `command-center.css` and `command-center.js` query versions.
- Do not reintroduce `home-guide.js` (was only for How It Works buttons).

- [ ] **Step 2: Spot-check IDs**

Confirm file still contains exact strings:
- `id="command-city-count"`
- `id="command-state-count"`
- `home-coverage.js`

- [ ] **Step 3: Commit**

```bash
git add public/command.html
git commit -m "feat(dashboard): coverage snapshot markup for /command"
```

---

### Task 3: Rewrite `command-center.css`

**Files:**
- Modify: `public/css/command-center.css` (full replace)

**Interfaces:**
- Consumes: classes from Task 2 HTML
- Produces: styles that Task 1 CSS test expects (`command-snapshot` or `command-metrics`)

- [ ] **Step 1: Replace entire CSS file with:**

```css
/* Dashboard — coverage snapshot (2026-07-19) */

.command-page {
  font-family: var(--font-body, 'Outfit', system-ui, sans-serif);
  background: var(--bg-deep, #080605);
  color: var(--text, var(--phuglee-cream, #f5f2e4));
  min-height: 100vh;
}

.command-page-ready,
.command-page-ready .command-hub > * {
  opacity: 1 !important;
  transform: none !important;
}

.command-main {
  position: relative;
  z-index: 1;
}

.command-hub {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2rem;
}

.command-snapshot-head {
  text-align: left;
}

.command-snapshot-title {
  margin: 0;
  font-family: var(--font-body, 'Outfit', system-ui, sans-serif);
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--phuglee-cream, #f5f2e4);
  text-wrap: balance;
}

.command-snapshot-lead {
  margin: 0.35rem 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--phuglee-meta-text, #b0a99c);
}

/* Twin metrics */
.command-metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: flex-start;
  gap: 1.5rem 2rem;
  padding: 1.75rem 1.5rem;
  border: 1px solid rgba(174, 163, 143, 0.22);
  border-radius: 12px;
  background: var(--phuglee-black-mid, #121212);
}

.command-metric {
  flex: 1 1 8rem;
  min-width: 7rem;
}

.command-metric-value {
  margin: 0;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: clamp(2.5rem, 8vw, 3.75rem);
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--phuglee-cream, #f5f2e4);
  font-variant-numeric: tabular-nums;
}

.command-metric-value--gold {
  color: var(--phuglee-gold, #eeb746);
}

.command-metric-label {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--phuglee-meta-text, #b0a99c);
}

.command-metric-divider {
  width: 1px;
  align-self: stretch;
  background: rgba(174, 163, 143, 0.2);
  flex: 0 0 1px;
}

@media (max-width: 420px) {
  .command-metric-divider {
    display: none;
  }
}

.command-coverage-status {
  margin: -1rem 0 0;
  font-size: 0.875rem;
  color: var(--phuglee-danger, #f87171);
}

/* Quiet links */
.command-quiet-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.15rem;
  align-items: center;
}

.command-quiet-link {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--phuglee-meta-text, #b0a99c);
  text-decoration: none;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.command-quiet-link:hover {
  color: var(--phuglee-cream, #f5f2e4);
  background: rgba(245, 242, 228, 0.06);
}

.command-quiet-link:focus-visible {
  outline: 2px solid var(--phuglee-orange, #e58435);
  outline-offset: 2px;
}

.command-quiet-link[hidden] {
  display: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .command-quiet-link {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/command-center.css
git commit -m "feat(dashboard): twin-hero coverage snapshot styles"
```

---

### Task 4: Slim `command-center.js`

**Files:**
- Modify: `public/js/command-center.js` (full replace)

**Interfaces:**
- Consumes: `[data-admin-only]` on Contracts link; optional `PhugleeSettings` / `PhugleeSession`
- Produces: no health poll; no mission; tests for absent `pollHealth` pass

- [ ] **Step 1: Replace entire JS file with:**

```js
(function () {
  'use strict';

  function hideShellLoading() {
    if (window.PhugleeStates && typeof window.PhugleeStates.hideShellLoading === 'function') {
      window.PhugleeStates.hideShellLoading();
    } else {
      var strip = document.getElementById('shell-loading-strip');
      if (strip) strip.hidden = true;
      document.body.classList.remove('shell-nav-loading');
    }
  }

  function revealAdminTools() {
    function show() {
      var isAdmin = window.PhugleeSettings && typeof window.PhugleeSettings.isAdmin === 'function'
        ? window.PhugleeSettings.isAdmin()
        : false;
      if (!isAdmin) {
        try { isAdmin = sessionStorage.getItem('phuglee_session') === 'admin'; } catch (_) {}
      }
      var isContractDesk = window.PhugleeSettings && typeof window.PhugleeSettings.isContractDesk === 'function'
        ? window.PhugleeSettings.isContractDesk()
        : isAdmin;
      if (!isContractDesk) {
        try {
          var user = sessionStorage.getItem('phuglee_session');
          isContractDesk = user === 'admin' || user === 'brad';
        } catch (_) {}
      }
      document.querySelectorAll('[data-admin-only]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        var showForDesk = isContractDesk && href.indexOf('/under-contract') >= 0;
        el.hidden = !(isAdmin || showForDesk);
      });
    }
    show();
    if (window.PhugleeSession && typeof window.PhugleeSession.syncSessionFromServerCookie === 'function') {
      window.PhugleeSession.syncSessionFromServerCookie().then(show);
    }
  }

  /**
   * If coverage never fills after load, surface a quiet unavailable line.
   * home-coverage.js owns success writes to #command-city-count.
   */
  function watchCoverageUnavailable() {
    var status = document.getElementById('command-coverage-status');
    var citiesEl = document.getElementById('command-city-count');
    if (!status || !citiesEl) return;

    window.setTimeout(function () {
      var text = (citiesEl.textContent || '').trim();
      if (!text || text === '—') {
        status.hidden = false;
      }
    }, 12000);
  }

  function init() {
    hideShellLoading();
    revealAdminTools();
    watchCoverageUnavailable();
    window.addEventListener('pageshow', hideShellLoading);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Run structural tests — expect PASS**

```bash
node --test tests/command-dashboard.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Run related existing tests**

```bash
node --test tests/a11y-seo.test.js tests/brand-audit.test.js
```

Expected: PASS (command still has SEO meta, `id="main"`, brand sheets via shell-bundle / components path as before).

If brand-audit fails because Anton/font or sheet list changed: fix only if a real brand rule is violated; shell-bundle must still load Phuglee components.

- [ ] **Step 4: Commit**

```bash
git add public/js/command-center.js
git commit -m "feat(dashboard): slim command-center to role gate + load hide"
```

---

### Task 5: Live verify + mobile ship gate

**Files:**
- None (verification only); fix regressions in the three files above if verify fails

**Interfaces:**
- Consumes: local server on :3000 via project scripts

- [ ] **Step 1: Ensure server + verify-live**

From project root `C:\Users\brand\Projects\distress-os`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-live.ps1
```

Expected: exit code 0 (health + homepage 200).

- [ ] **Step 2: Smoke `/command`**

```powershell
# PowerShell
$r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/command" -UseBasicParsing
$r.StatusCode
$r.Content -match 'command-city-count'
$r.Content -match 'Mission Board'
```

Expected:
- StatusCode `200`
- `command-city-count` → `$true`
- `Mission Board` → `$false`

- [ ] **Step 3: Mobile verify scoped to command**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-mobile.ps1 -Pages "/command"
```

Expected: exit 0 (or project-standard success). If script has no `-Pages` support, run default mobile verify and confirm `/command` is covered / open page manually at narrow width.

- [ ] **Step 4: Manual browser checklist (implementer)**

Open `http://127.0.0.1:3000/command` signed in:
1. Twin numbers load to real counts (not stuck on `—` forever when forge coverage is up)
2. Quiet links: Collect, Filter, Analyze work
3. Contracts hidden for non-desk roles; visible for admin/brad/contract desk
4. No mission board, pulse, tools chips, How It Works primary, health dots

- [ ] **Step 5: Final commit if any verify fixes**

```bash
git add public/command.html public/css/command-center.css public/js/command-center.js
git commit -m "fix(dashboard): ship-gate fixes for coverage snapshot"
```

(Skip commit if no fix diffs.)

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Twin hero cities + states | 2, 3 |
| Quiet links Collect/Filter/Analyze/Contracts | 2 |
| Delete mission/checklist/pulse/tools/health | 2, 4 |
| Keep `#command-city-count` / `#command-state-count` | 2 |
| Slim JS, no health poll | 4 |
| Role-gated Contracts | 2, 4 |
| Loading `—`, unavailable line | 2, 4 |
| Product tokens, no Anton marketing hero | 2, 3 |
| Structural tests | 1 |
| verify-live + mobile | 5 |
| No deal/funding KPIs | 2 (absent by design) |
| No home-coverage.js changes | File map |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-dashboard-coverage-snapshot.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks  
2. **Inline Execution** — This session, task-by-task with checkpoints  

Which approach?
