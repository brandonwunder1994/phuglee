# Site audit remediation — wave program

**Started:** 2026-07-23  
**Rule:** One wave at a time. No next plan until the current wave is executed, tested, and closed.

## Cadence (every wave)

1. **Write plan** — full implementation plan for this wave only  
2. **You approve** — say `[Plan approved]` or “approve Wave N” (or request changes)  
3. **Execute** — implement the plan  
4. **Test** — unit/contract tests + live verify (Wave 0 requires `-Deep`)  
5. **Close** — write closeout notes; you confirm the wave is done  
6. **Next** — only then write the next wave’s full plan  

## Waves

| Wave | Theme | Plan file | Status |
|------|--------|-----------|--------|
| **0** | Trust & reliability | `2026-07-23-wave-0-trust-reliability.md` | **Closed 2026-07-23** |
| **1** | Speed / load time | `2026-07-23-wave-1-speed-load.md` | **Closed 2026-07-23** |
| **2** | Correctness & UX edges | `2026-07-23-wave-2-correctness-ux.md` | **Closed 2026-07-23** |
| **3** | Scale & housecleaning | `2026-07-23-wave-3-scale-housecleaning.md` | **Closed 2026-07-23** |

## Program status

**COMPLETE** (2026-07-23). Waves 0–3 planned, approved, executed, verified, and closed.

## What each wave is (reminder)

- **Wave 0:** Forge up, Vault handoff, login tabs, safe vault writes, honest deep health, water Filter tests  
- **Wave 1:** Government lists weight, shell CSS waterfall, minify/compress, big images/videos, cache versions  
- **Wave 2:** Settings order, map fallbacks, Trust Funds route decision, smaller UI bugs  
- **Wave 3:** Vault scale, remove risky public stubs, code dedupe, home CSS trim  

## Constraints (all waves)

- Never wipe filter lists, brain, Form Forge data, or analyzer sessions without explicit ask  
- Never claim live/fixed without proof in the same turn (`verify-live.ps1`)  
- Do not start the next wave’s plan until the previous wave is closed  
