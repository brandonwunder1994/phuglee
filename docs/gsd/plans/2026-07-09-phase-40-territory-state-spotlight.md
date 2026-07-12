# Phase 40 — State Spotlight Dossier

> **GSD:** `/gsd:execute-phase 40`  
> **Milestone:** [M6 Territory Theater](../milestones/M6-territory-theater.md)  
> **Depends on:** Phases 37–39 (palette, HUD, ticker stable)

**Goal:** Selecting a state feels like opening a **dossier**, not expanding a search widget. Search remains available but demoted. Spotlight shows state identity, counts, sample cities, status, and path into city profile.

**Architecture:** Extend explorer select/hover UX. Introduce a spotlight panel (can replace or sit above dock body content). Reuse city list data already computed for dock counties; restyle presentation. Keep `PhugleeCityProfileModal` as the deep dive.

**Tech stack:** Existing explorer dock DOM + CSS, optional new spotlight region.

---

## Quality bar

| Pass | Fail |
|------|------|
| Click state → immediate rich spotlight | Only “Explore coverage” + search |
| Shows state name, city count, status, 3–8 city pills | Empty dock / raw unstyled list only |
| Search still works | Search broken or hidden permanently |
| Blocked / no-coverage states get clear copy | Generic error or blank |
| City pill → existing city profile modal | Dead clicks / new unscoped page |
| Feels ops dossier (grit) | Bootstrap admin table |

---

## Interaction model (locked)

| User action | Result |
|-------------|--------|
| Click covered state | Spotlight open; map highlight; sample cities; dock open on state panel |
| Click blocked state | Spotlight open; “can’t pull records” message; no fake cities |
| Click soon/empty state | Spotlight open; expanding copy |
| Click same state again | Optional toggle close — **prefer keep open** (less flicker) |
| Search query | Search results panel; spotlight can show “Search results” head |
| Back / clear | Reset to national view; dock hint; clear map selection |
| Click city pill / list row | Open city profile modal (existing) |

---

## Spotlight content (covered state)

```text
┌─ ARIZONA ─────────────────────────────┐
│  14 cities live · Portal + PDF         │
│  ─────────────────────────────────     │
│  [Phoenix] [Tucson] [Mesa] [Scottsdale]│
│  [Tempe] [Glendale] …                  │
│                                        │
│  Click a city for full profile         │
│  or browse counties below              │
└────────────────────────────────────────┘
```

**Status lines:**

| Status | Meta line |
|--------|-----------|
| covered | `{N} cities live` + pin mix if known |
| unavailable | `Records unavailable — clerk systems block access` |
| no-coverage | `Expanding — no cities listed yet` |

Sample cities: first **6–8** sorted alpha (or prioritize portals), rest via county browser already in dock.

---

## Markup approach (recommended)

Add a spotlight block **above** dock body panels (still inside `#home-coverage-dock` or as sibling inside monitor):

```html
<div class="home-territory-spotlight" id="home-territory-spotlight" hidden>
  <div class="home-territory-spotlight-head">
    <h3 class="home-territory-spotlight-title" id="home-spotlight-title">—</h3>
    <p class="home-territory-spotlight-meta" id="home-spotlight-meta"></p>
  </div>
  <div class="home-territory-spotlight-cities" id="home-spotlight-cities"></div>
  <p class="home-territory-spotlight-hint" id="home-spotlight-hint"></p>
</div>
```

When national (no selection): `hidden` on spotlight; show dock hint.

**Dock chrome demotion:**

- Default collapsed title: `Explore territory` (not bland “Explore coverage” only — optional)
- Search placeholder stays
- When state selected: dock title = state name; sub = `{n} cities`
- Hint text shortens once spotlight carries the story

---

## JS changes (`home-coverage-explorer.js`)

In `selectState(name)` (or equivalent):

1. Set map filters / currentState (existing)
2. Call `renderSpotlight(name, coverage)`
3. Existing `showDockPanel('home-dock-state')` + county browser stays
4. Wire city pills:

```js
btn.addEventListener('click', function () {
  if (modal && city.id) modal.open(city.id);
});
```

Confirm city object shape from coverage (`id` / `city_id` / slug) against `city-profile-modal.js` expectations — **read modal open signature before coding**.

**Hover-only:** do **not** open full spotlight on hover (too noisy); keep lift highlight only. Spotlight on click/select.

---

## CSS

- Spotlight: glass panel, left gold edge **avoided** if impeccable bans side-stripe — use full border + top gold hairline instead
- Title: Anton / display, cream
- City pills: pill buttons, min-height 44px on touch, hover gold border
- Blocked state: subtle red-tinted meta, no green checkmarks
- Animate open: opacity + translateY 6px; reduced-motion → instant

---

## Files

| Action | Path |
|--------|------|
| Modify | `public/index.html` — spotlight shell |
| Modify | `public/css/coverage/coverage-dock.css` and/or `home.css` |
| Modify | `public/js/home-coverage-explorer.js` — select + renderSpotlight |
| Read | `public/js/coverage/city-profile-modal.js` — open API |
| Possibly | `public/js/coverage/coverage-shared.js` — helpers |

---

## Tasks

### Task 1: Read modal + city shape

- [ ] Confirm how city profile opens (id field name)
- [ ] Confirm county browser still receives same data structures

### Task 2: Spotlight markup + CSS

- [ ] Add shell + styles (dossier, not table)
- [ ] Mobile: spotlight full width above dock body

### Task 3: renderSpotlight + selectState wiring

- [ ] Covered / blocked / empty branches with locked copy
- [ ] City pills + modal open
- [ ] Reset path clears spotlight
- [ ] Search path doesn’t leave stale state title

### Task 4: Verify

- [ ] Click 3 covered states (multi-city, single-city if any)
- [ ] Click 1 blocked state
- [ ] Search city → open profile
- [ ] Keyboard: focus visible on pills
- [ ] `npm test` + verify-live
- [ ] Screenshot: spotlight open on a hot state

### Task 5: Commit

```text
feat(home): state spotlight dossier on territory map select
```

---

## Done when

Map exploration is **storytelling**. Search is a power tool, not the face of the section.

## Out of scope

Rewriting full Form Forge map page; entrance cascade; fused close (41).
