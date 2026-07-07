# Feature Research — Lead Export

**Domain:** Real-estate investor lead export for dialer/CRM workflows  
**Researched:** 2026-07-01  
**Confidence:** HIGH

## Feature Landscape

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Export all leads | User reviewed full list; wants complete database dump | LOW | `scope: 'all'` exists but column set wrong |
| Contact fields | Dialer needs name + phone + email | LOW | `firstName`, `lastName`, `phone`, `email` on records |
| Address fields | Mailers + skip trace need clean address | LOW | `street`, `city`, `state`, `postal` already parsed on import |
| Lead source type | Investor tracks list provenance | LOW | `leadType` with 5 canonical types |
| Excel format | Industry default for lead lists | LOW | Already supported via SheetJS |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Street View URL in export | Visual verification without reopening app | MEDIUM | Requires imagery hydration + absolute URL |
| Cache Date column | Know when imagery was captured | LOW | `imagery.streetView.cachedAt` → formatted date |
| Distress tier + property type split | Separates "how distressed" from "is it a house" | LOW | `resultLeadTier()` vs `resultCategory()` |
| Review status in export | Know which leads were human-verified | LOW | `isManuallyReviewed()` already exists |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| 30+ AI columns | "Export everything" | Overwhelms dialers; most columns unused | Fixed dial-ready schema |
| Filter-only export as default | Current behavior | User wants full database | Add explicit "Export Database" action |
| API key in Street View URL | Direct Google image links | Exposes key in shared spreadsheets | Use cached `/api/cached-imagery/` absolute URLs or Maps pano links |

## MVP (v1.7)

- [x] Full-database export mode — user requirement
- [x] Fixed 12-column schema per user spec
- [x] Street View URL when imagery cached
- [x] Lead Type human labels
- [x] Lead Category = tier (Distressed / Well Maintained / Vacant / etc.)
- [x] Property Type = Home / Land/Lot / Blocked / Unavailable

### Add After Validation

- [ ] Google Maps browser pano link (clickable in Excel without server)
- [ ] Satellite URL fallback column when no Street View
- [ ] "Manually Reviewed" column
- [ ] Distress Score column for sort-in-Excel

## Prioritization

| Feature | User Value | Cost | Priority |
|---------|------------|------|----------|
| Full-database fixed schema | HIGH | LOW | P1 |
| Street View URL | HIGH | MEDIUM | P1 |
| Cache Date | HIGH | LOW | P1 |
| Lead Category + Property Type | HIGH | LOW | P1 |
| Manually Reviewed flag | MEDIUM | LOW | P2 |
| Distress Score | MEDIUM | LOW | P2 |
| Maps pano browser link | MEDIUM | MEDIUM | P2 |

---
*Feature research for: v1.7 Lead Export*