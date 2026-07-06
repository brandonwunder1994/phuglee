# Phase 31: Cross-App Signature QA

**Requirements:** BRAND-35–37  
**Repos:** all three  
**Status:** pending

## Checklist

- [ ] Visual audit path: `/` → sign-in → Hub → Collect → Bridge → 7 Forge → Analyzer → Hub
- [ ] Checklist from `.planning/v1.3-PHUGLEE-SIGNATURE-BRAND.md` §8–9 per page
- [ ] No leftover Heat ember `#e85d04` hardcoded (grep audit)
- [ ] No generic SaaS chrome (unstyled tables, default modals)
- [ ] distress-os `npm test` — 16/16 pass
- [ ] property-distress-analyzer `npm test` — 190+ pass
- [ ] city-list-requests `gsd.py verify` — document known exceptions
- [ ] Update M4 milestone status → `complete`
- [ ] Run `/gsd:complete-milestone`

## Success criteria

Entire site feels like one high-end brand — dark, artistic, bold, cohesive, expensive.