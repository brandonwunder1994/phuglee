# Data Bridge v2 — Distressed Signal Tagging Rules

> Implemented in `lib/bridge-distress-tagger.js`. Case-insensitive matching against violation text.

## Upload Type Behavior

### Code Violation

1. Search text is built from: `Violation/Issue Type` + `Description/Notes` + `Street Address` (+ all raw cells)
2. **Category** — every row is assigned **exactly one** of 24 clear categories (`lib/bridge-violation-categories.js`). No "Other". Used for Filter table, search, CSV/XLSX export.
3. If **any** strong indicator category matches → tag **Strong Distressed Signal** and list matched indicators
4. If no strong match → tag **Standard Code Violation**
5. **Retention:** only **Strong Distressed Signal** rows are kept. Standard/generic rows are discarded with reason `no_distress_signal` (permits, parking, noise, zoning, etc.). Category is still set on both kept and not-distressed rows for Train/review.

Open/closed status does **not** affect tagging. Vegetation / property maintenance / blight matching is intentionally **loose** so vague city labels still keep.

**Not kept as distress:** parking on lawn, fence/pool/sign permits, noise, HOA admin, business license, etc.

### 24 Filter Categories (display / export)

Exactly one per code-violation row (priority pick when multiple patterns match):

1. Overgrown Grass & Weeds · 2. Trash & Junk Accumulation · 3. Abandoned or Broken Vehicles · 4. Illegal Parking · 5. Business Tax or License · 6. General Sanitation · 7. Exterior Paint & Walls · 8. Roof or Drainage Problems · 9. Interior Walls & Doors · 10. Broken Appliances · 11. Electrical or Plumbing Issues · 12. Bugs or Rodents (Infestation) · 13. Windows & Screens · 14. Sheds or Accessory Buildings · 15. Outdoor Storage · 16. Sidewalks or Driveways · 17. House Number / Address Sign · 18. Building Permits · 19. Zoning or Property Rules · 20. Illegal Signs or Banners · 21. Stairs or Porch Safety · 22. Corner Visibility (Sight Lines) · 23. Farming or Tree Issues · 24. Business Operation Rules

Unmatched text falls back to **Zoning or Property Rules** (never vague "Other").

### Water Shut Off

Every kept row receives:

- **Tag:** `Water Shut Off – High Value Distress Signal`
- **Matched Indicators:** (empty)

No keyword scan is performed for water shut off uploads.

---

## Strong Distressed Signal Categories

### 1. Tall / Overgrown / High Grass or Weeds

Matches references to height, rank/overgrown vegetation, or unmaintained lawns.

**Keywords / patterns:**

- overgrown, high grass, tall grass, rank vegetation, weed(s), weed violation
- grass/vegetation within ~30 chars of height/inch/inches/ft/feet/12/18/24/36
- unmaintained lawn(s), uncut grass, lawn maintenance

### 2. Accumulation of Trash, Junk, Debris, or Solid Waste

Matches improper outdoor storage of waste, furniture, appliances, tires, or building materials.

**Keywords / patterns:**

- trash, junk, debris, rubbish, solid waste, refuse, litter
- accumulation/accumulated/excessive/improper storage near trash/junk/debris
- furniture, appliances, tires, building materials, mattress, sofa, couch near outside/yard/property/curb
- yard waste, illegal dumping, open storage

**Not distress (excluded):** trash cans / garbage cans / recycle bins / refuse containers left out — containers alone are not a trashed property. Real debris, dump piles, and “trashed house” still keep.

**Not kept (non-residential / non-house):** apartment complexes, commercial buildings, shopping centers, warehouses, hotels, schools/hospitals/churches, parking lots, and highway / interstate right-of-way or median work. These are discarded as `non_property` (not lead targets). **Vacant lots and single-family houses still keep.** Residential street names like “Old Highway 50” alone are not excluded.

### 3. Abandoned, Inoperable, Derelict, or Unregistered Vehicles

Matches vehicles left on the property in non-operational condition.

**Keywords / patterns:**

- abandoned/inoperable/derelict/junk/unregistered + vehicle/car/truck/trailer/RV (either order)
- inoperable vehicle, junk vehicle, abandoned vehicle, unregistered vehicle

### 4. Dilapidated, Blighted, or Dangerous Structures

Matches structural neglect, broken openings, peeling paint with neglect context, vacant/open structures.

**Keywords / patterns:**

- dilapidated, blighted, deteriorated/deteriorating, unsafe, dangerous, structural, substandard
- broken/missing/boarded + window(s)/door(s)
- peeling paint, paint peel
- vacant and open, open to the elements, unsecured structure
- structure/building/dwelling/residence near neglect/deteriorat/unsafe/condemned/uninhabitable

### 5. Exterior Nuisance or Maintenance Failure

Matches other clear exterior neglect not covered above.

**Keywords / patterns:**

- exterior maintenance, property maintenance, failure to maintain
- nuisance, public nuisance, exterior nuisance
- unsanitary, rodent, vermin, infestation
- fence/fencing near dilapidated/deteriorat/missing/fallen/leaning/unsafe
- roof/siding/gutter/porch/steps near deteriorat/damaged/missing/unsafe/collapse

---

## Output Fields

| Field | Strong Match | No Match (Code Violation) | Water Shut Off |
|-------|--------------|---------------------------|----------------|
| Category | One of 24 clear categories | One of 24 clear categories | (empty) |
| Distressed Signal Tag | Strong Distressed Signal | Standard Code Violation | Water Shut Off – High Value Distress Signal |
| Matched Indicators | Distress indicator labels joined with `; ` | (empty) | (empty) |

---

## Test Examples

| Description | Expected Tag | Expected Indicators |
|-------------|--------------|---------------------|
| "Overgrown weeds exceeding 12 inches" | Strong Distressed Signal | Tall/overgrown/high grass or weeds |
| "Accumulation of trash and debris in yard" | Strong Distressed Signal | Accumulation of trash, junk, debris, or solid waste |
| "Abandoned inoperable vehicle on property" | Strong Distressed Signal | Abandoned, inoperable, derelict, or unregistered vehicles |
| "Dilapidated structure with broken windows" | Strong Distressed Signal | Dilapidated, blighted, or dangerous structures |
| "Fence in deteriorated condition" | Strong Distressed Signal | Exterior nuisance or maintenance failure indicating neglect |
| "Fence permit expired" | Standard Code Violation | (none) |
| Any water shut off record | Water Shut Off – High Value Distress Signal | (none) |

---

## Filter Superpower Brain (global, admin-trained)

After base regex tagging, the global Filter brain can adjust Strong vs Standard outcomes for **code_violation** uploads. Base `INDICATOR_CATEGORIES` above remain authoritative for the keyword layer.

### Runtime order for `code_violation`

1. **Base regex** — `INDICATOR_CATEGORIES` in this document (via `lib/bridge-distress-tagger.js`)
2. **Active promote type** — normalized Violation/Issue Type key → force Strong Distressed Signal
3. **Active phrase rules** — literal patterns on search text (promote or suppress phrase)
4. **Active suppress type** — final veto on type key → demote to Standard (not kept)
5. **Keep filter** — only Strong Distressed Signal rows stay on the kept list; Standard rows go to the not-distressed review pool

### Water shut-off

- **Exempt from type suppress** — always high-value pass-through; type suppress rules never demote water rows
- **Phrase rules N/A in v1** — phrase mining and phrase apply are not used for water shut-off training

### Training

- **Admin-only** on `/bridge` → **Train brain** (Approve / Deny groups)
- **Operator model:** ✓ Approve = AI was right (leave on this list). ✗ Deny = AI was wrong (move to the other list + type rule).
  - **Distressed + Approve** — keep as distressed
  - **Distressed + Deny** — move to not-distressed + **suppress type** for future uploads
  - **Not distressed + Approve** — leave off the list
  - **Not distressed + Deny** — move to distressed + **promote type** for future uploads
- **Type rules** go live immediately on the next process (and list mutation for the current batch)
- **Phrase rules** are **proposed** from training evidence, then **activated** (or rejected) in the **Filter brain** panel
- Non-admins only receive improved automatic tagging; they cannot train or edit rules
- **Undo** is split: client restores the kept/not-distressed list snapshot; server reverts rules from the last training event

### Persistence

- Global durable brain JSON under the Filter volume-safe path (`BRIDGE_BRAIN_ROOT` / `global-brain.json`)
- **Not** the Property Analyzer vision learned-brain store
- Caps: events 2000, type rules 500, phrase rules 500; concurrent writers use `brain.version` (stale → HTTP 409)

### Train review grouping (v1.7 accuracy)

- Unmapped category-like columns (e.g. `Vio Cat`) promote into Violation/Issue Type so FN and distressed labels show the city category.
- Incidental dates/times in free-text descriptions or type cells are stripped for **group keys only** so same-category rows stack; Singleton is only when group count === 1.
- Process rows keep matched signal indicators as arrays for Train chips; export still joins with `; `.

### Gold fixtures (Phase 57 ACC)

Durable synthetic keep/deny/water/no-Type fixtures live under `tests/fixtures/bridge/gold/`. Automated contracts: `tests/bridge-accuracy-gold.test.js` (ACC-01 keep/kill + water never type-suppressed; ACC-02 no silent-drop; ACC-03 Type-winner smoke). Do not weaken gold asserts to force green.
