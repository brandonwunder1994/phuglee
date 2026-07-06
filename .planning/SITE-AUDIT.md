# Phuglee / Distress OS — Current Site Audit

**Date:** 2026-07-06  
**Purpose:** Ground truth for M4 Phuglee Signature Brand milestone

---

## Architecture Overview

| Layer | Tech | Port | Role |
|-------|------|------|------|
| **Distress OS shell** | Node.js 20, vanilla HTML/CSS/JS | `:3000` | Landing, auth, hub, collect, bridge, proxy, nav injection |
| **Form Forge** | Python Flask, vanilla HTML/CSS/JS | `:8787` | FOIA PDF filler, portal tracker, map, request workflows |
| **Property Analyzer** | Node.js, vanilla HTML/CSS/JS + Tailwind build | `:3456` | AI scan, review overlay, export, session persistence |

**Not present today:** React, TypeScript, Framer Motion, e-commerce, cart/checkout, CMS, SSR framework.

**Proxy:** `lib/rewrite.js` injects shell CSS, nav, premium backdrop, and rewrites asset paths for `/forge/*` and `/analyzer/*`.

---

## Route Map — Distress OS Shell (`:3000`)

| Route | File | Auth | Primary JS | Status |
|-------|------|------|------------|--------|
| `/` | `index.html` | Public (auth modal on CTA) | `auth.js` | Logo page + distressed home — **strongest brand moment** |
| `/heat` | `heat.html` | `auth-guard.js` | `hub-pricing.js`, `shell-nav.js` | How It Works + pricing |
| `/collect` | `collect.html` | `auth-guard.js` | `collect-records.js`, `shell-nav.js` | Collect Records launcher + dialogs |
| `/bridge` | `bridge.html` | `auth-guard.js` | `bridge.js`, `bridge-schema.js` | XLSX converter utility |
| `/api/health` | `server.js` | Public | — | Module status JSON |

### Shell CSS Stack (current)

```
tokens.css → heat-base.css → heat-atmosphere.css → heat-components.css
→ premium-atmosphere.css → premium-components.css (v1.2)
→ shell.css → shell-nav.css → page CSS (landing, auth, hub, collect, bridge)
```

### Shell JS Functions

| Module | Responsibility |
|--------|----------------|
| `auth.js` | Sign-in/sign-up flip card, pricing tier selection, localStorage users, session |
| `auth-guard.js` | Redirect unauthenticated users from protected routes |
| `shell-nav.js` | Global nav HTML builder, active states, sign-out |
| `shell.js` | Embedded module helpers, nav offset |
| `hub-pricing.js` | City count fetch for Pro tier |
| `collect-records.js` | Workflow dialog, PDF filler form, Forge redirects |
| `bridge.js` | City/file picker, column mapping, XLSX export |

---

## Route Map — Form Forge (`/forge/*` → `:8787`)

| Page | File | Key functions |
|------|------|---------------|
| Records Desk | `index.html` + `app.js` | PDF editor, field placement, save/fill |
| City Tracker | `portal.html` + `portal.js` | Request status, city queue |
| Coverage Map | `map.html` + `map.js` | MapLibre, boundary layers |
| Request PDFs | `request-pdfs.html` | Email PDF workflow |
| Submit Portals | `submit-portals.html` | Online portal submissions |
| Email-only | `email-only-requests.html` | Plain email FOIA |
| Portal Errors | `portal-errors.html` | Error queue |

**Styling:** `style.css`, `portal.css`, page-specific CSS, `premium-forge.css` (v1.2 partial pass).

---

## Route Map — Property Analyzer (`/analyzer/*` → `:3456`)

| Surface | File | Key functions |
|---------|------|---------------|
| Main app | `index.html` + `app.js` modules | Upload, scan, review overlay, export, session |
| Marketing landing | `landing.html` | Pre-app sales page (standalone port) |

**JS modules:** `scan.js`, `review.js`, `render.js`, `session.js`, `state.js`, `imagery.js`, `config.js`

**Styling:** Tailwind build + cyber-theme stack + `heat-theme.css` + `premium-analyzer.css` (v1.2 partial pass).

---

## Brand Gap Analysis (M3 → M4)

| Area | Current | Gap vs logo-ground-truth brief |
|------|---------|--------------------------------|
| **Color system** | Heat ember `#e85d04` dominant | Logo uses `#E58435` vibrant orange + taupes `#AEA38F` — palette not logo-exact |
| **Typography** | Anton + Outfit | Logo is heavy condensed all-caps — need tighter display face audit (Anton close; may need Bebas/Anton SC tuning) |
| **Logo SVG** | Static `<img>` on landing | No reusable component, no deconstructed patterns, no hero integration beyond scale |
| **Motion** | CSS keyframes only | No orchestrated page transitions, stagger reveals, or premium micro-interactions |
| **Texture** | Photo + SVG grain (v1.2) | Missing logo-derived organic/geometric pattern system |
| **Post-login** | Partial v1.2 premium pass | Still reads "SaaS dashboard" in places vs "high-end streetwear brand" |
| **States** | Basic error/hidden panels | No designed loading/empty/error brand moments |
| **Tech stack** | Vanilla HTML | Brief requests React + Framer Motion — **architectural decision required** |

---

## What Is NOT in Scope (today)

- E-commerce / cart / checkout (no shop exists)
- Multi-tenant auth / SSO (localStorage demo auth only)
- Cloud deployment / CDN (local desktop stack)

---

## Page Count Summary

| Repo | Surfaces |
|------|----------|
| Distress OS shell | 4 HTML pages + auth modal + global nav |
| Form Forge | 7 HTML pages |
| Property Analyzer | 2 HTML (app + landing) + ~15 UI surface groups in SPA-like app |
| **Total** | **13+ routed pages**, **20+ distinct UI surfaces**