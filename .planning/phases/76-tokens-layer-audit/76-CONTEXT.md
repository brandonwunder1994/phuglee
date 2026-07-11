# Phase 76: Tokens & Layer Audit - Context

**Gathered:** 2026-07-11  
**Status:** Ready for planning  
**Source:** v3.0 locked decisions

## Phase Boundary

Align Filter with home/login Phuglee tokens (color, glass, type, status); document z-index scale; ban hex islands in desk chrome.

**Requirements:** TOKENS-01, TOKENS-02, TOKENS-03, TOKENS-04

## Implementation Decisions

### Locked
- Extend `tokens.css` only when gap proven vs inventing bridge-local palette
- North star: `auth.css` + home glass/grain/cream/orange
- CSS only; no JS
- Manual `?v=` cache bust when shipping CSS changes
- Zero new packages

### Agent Discretion
- Which density/chip/row tokens to add if missing
- How aggressive to replace hex in bridge.css this phase vs later paint phases (prefer token aliases this phase)

## Canonical References

- `public/css/tokens.css`
- `public/css/distress-glass.css`
- `public/css/auth.css`
- `.planning/research/STACK.md`, `ARCHITECTURE.md`
- `.planning/phases/75-contract-freeze-surface-inventory/` (contracts)
