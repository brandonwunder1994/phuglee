# M1 — Shell & Integration (v1.0)

> **Status:** `complete`  
> **Shipped:** 2026-07-01  
> **Scope:** Landing, Command Hub, proxy, Data Bridge, health API

---

## Goal

Unified local shell for Form Forge and Property Distress Analyzer — one entry point, reverse proxy, optional data bridge. Child apps run unchanged on original engines.

## Delivered

- Landing page (`/`) with Heat aesthetic
- Command Hub (`/heat`) with tool cards and status pills
- Reverse proxy `/forge/` → `:8787`, `/analyzer/` → `:3456`
- Data Bridge (`/bridge`) XLSX converter
- `launch-distressos.bat` auto-starts modules
- Unit tests: rewrite, bridge-schema, module-proxy

## GSD phases (v1.0)

| Phase | Name | Status |
|-------|------|--------|
| 1 | Project scaffold | complete |
| 2 | Landing + Hub | complete |
| 3 | Module proxy | complete |
| 4 | Data Bridge | complete |
| 5 | Launch orchestration | complete |
| 6 | Verification | complete |