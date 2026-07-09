# Data Bridge v2 — Distressed Signal Tagging Rules

> Implemented in `lib/bridge-distress-tagger.js`. Case-insensitive matching against violation text.

## Upload Type Behavior

### Code Violation

1. Search text is built from: `Violation/Issue Type` + `Description/Notes` + `Street Address`
2. If **any** strong indicator category matches → tag **Strong Distressed Signal** and list matched categories
3. If no strong match → tag **Standard Code Violation**
4. **Retention:** only **Strong Distressed Signal** rows are kept. Standard/generic rows are discarded with reason `no_distress_signal` (permits, parking, noise, zoning, etc.).

Open/closed status does **not** affect tagging. Vegetation / property maintenance / blight matching is intentionally **loose** so vague city labels still keep.

**Not kept as distress:** parking on lawn, fence/pool/sign permits, noise, HOA admin, business license, etc.

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
| Distressed Signal Tag | Strong Distressed Signal | Standard Code Violation | Water Shut Off – High Value Distress Signal |
| Matched Indicators | Category labels joined with `; ` | (empty) | (empty) |

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