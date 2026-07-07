# Phase 11: Calm Design Foundation - Context

**Gathered:** 2026-06-30  
**Status:** Ready for ui-phase / plan-phase

<domain>
## Phase Boundary

Establish the calm design foundation for v1.3: semantic color/typography/spacing tokens, Tailwind build pipeline, shadcn-compatible CSS variables, and retirement of cyber-HUD visual language at the token layer. No shell layout restructuring (Phase 12), no workflow surface changes (Phase 13), no results toolbar changes (Phase 14). JS behavior and DOM IDs unchanged except font/stylesheet links.

</domain>

<decisions>
## Implementation Decisions

### Aesthetic direction
- **D-01:** Calm premium minimalism — warm-neutral dark base (stone/zinc), not cyber void + neon
- **D-02:** Single restrained accent (muted sage `#6b9b7a` or warm amber for CTAs only); tier colors stay semantically distinct but desaturated
- **D-03:** Remove decorative motion: hud-blink, pulse dots, glow text-shadows, gradient mesh backgrounds — scan progress bar may keep subtle fill animation only

### Typography
- **D-04:** Font pairing: `Newsreader` (display/headings, editorial calm) + `IBM Plex Sans` (body/UI) — avoid Inter, Roboto, Space Grotesk, Syne
- **D-05:** Type scale: 14px body, 16px UI labels, 20px section titles, 28px page title; weights 400 + 600 only

### Token architecture
- **D-06:** shadcn-compatible semantic tokens on `:root` — `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--border`, `--ring`, `--destructive`
- **D-07:** Tier semantic tokens preserved: `--tier-distressed`, `--tier-well`, `--tier-review`, `--tier-land`, `--tier-blurred` — recalibrated to calm palette
- **D-08:** New `public/css/tokens.css` as single source; `app.css` imports it; legacy `--neon-*` vars aliased to new tokens during migration (shim period)

### Build pipeline
- **D-09:** Tailwind CSS v4 CLI via npm devDependency; `npm run css:build` produces compiled CSS
- **D-10:** Input file `public/css/input.css` with `@import "tokens.css"` + `@tailwind` directives; output linked in `index.html` before `app.css`
- **D-11:** No React; shadcn/ui used as token/CSS reference only, not component import

### Migration strategy
- **D-12:** Incremental — token layer first, then class-by-class in later phases; do not delete 6,650-line `app.css` in Phase 11
- **D-13:** Gate legacy HUD styles behind `.legacy-hud` class on `<body>` during transition; remove gate in Phase 12 when shell restructured
- **D-14:** All existing DOM IDs preserved in Phase 11

### the agent's Discretion
- Exact oklch/hsl values within calm stone/zinc range
- Tailwind v3 vs v4 choice if v4 CLI friction on Windows
- Whether to add `prefers-reduced-motion` global guard in Phase 11 or Phase 12
- Font loading strategy (preconnect vs self-host)

</decisions>

<specifics>
## Specific Ideas

- "Feels like Linear meets Notion" — quiet, trustworthy, not a command center
- Command palette (⌘K) is the right power-user layer; visible chrome should not compete with it
- Reference: shadcn zinc dark theme as starting token set, warmed slightly
- Five high-impact changes locked in `11-DESIGN-BRIEF.md` — Phase 11 delivers Change 1 (tokens) + Change 3 (Tailwind pipeline)

</specifics>

<canonical_refs>
## Canonical References

### Design direction
- `.planning/phases/11-calm-design-foundation/11-DESIGN-BRIEF.md` — Step 1–3 research, review, five changes
- `.planning/PROJECT.md` — Core value, constraints, active requirements
- `.planning/REQUIREMENTS.md` — DS-01 through DS-05 acceptance criteria
- `.planning/ROADMAP.md` — Phase 11 boundary and success criteria

### Existing UI implementation
- `public/index.html` — DOM structure and IDs
- `public/css/app.css` — current cyber-HUD tokens and classes
- `public/js/app.js` — `initAppShell`, command palette
- `docs/gsd/milestones/M1-core-bones.md` — backend capabilities that must not regress

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `initAppShell()` / ⌘K command palette — progressive disclosure vehicle for Phase 12+
- `PDA.env` module pattern — all JS reads DOM by ID; HTML changes need ID preservation
- `--font-display`, `--font-body`, `--font-mono` CSS vars — replace values, keep var names initially

### Established Patterns
- Glass morphism (`.glass`, `.hud-panel`) — replace with flat bordered surfaces in token layer
- Tier color CSS vars used across cards, filters, review mode — must remap not remove
- `body::before` gradient mesh — remove in Phase 11 token pass

### Integration Points
- `index.html` `<head>` — font links + stylesheet order
- `package.json` — add css:build script
- `routes/static.js` — serves `/css/*`; no change expected

</code_context>

<deferred>
## Deferred Ideas

- Light/dark mode toggle — post v1.3 (THEME-01)
- HUD bar removal — Phase 12 (Change 2)
- Empty/scan/summary simplification — Phase 13 (Change 4)
- Results toolbar segmented control — Phase 14 (Change 5)
- Review mode visual polish — Phase 15
- React + shadcn component migration — out of scope

</deferred>

---

*Phase: 11-calm-design-foundation*  
*Context gathered: 2026-06-30*