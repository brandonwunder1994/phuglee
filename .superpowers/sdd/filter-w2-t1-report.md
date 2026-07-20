# Wave 2 Task 2.1 — Report

## Status: DONE

Paste convert no longer overwrites an operator-selected list type with Code Violation.

## Goal

After paste→Excel convert, preserve Water / Pre-lien / etc. when already selected; only default to Code Violation when no type is set.

## Changes

| File | Change |
|------|--------|
| `public/js/bridge.js` | In `convertPasteToExcel`, wrap `applyDefaultUploadType()` in `if (!selectedUploadType)` |
| `public/bridge.html` | Cache-bust `bridge.js?v=90` → `v=91` |
| `tests/bridge-paste-type-preserve.test.js` | Static contract: post-stage paste path must guard default |

### Core fix

```js
// Only default Code violation when operator has not already picked a list type
if (!selectedUploadType) {
  applyDefaultUploadType();
}
```

Init / post-save still call `applyDefaultUploadType()` unconditionally so the default Code Violation path remains for empty sessions.

## Tests

```text
node --test tests/bridge-paste-type-preserve.test.js
# 3 pass, 0 fail
```

- paste convert only defaults upload type when none selected
- applyDefaultUploadType still exists for init / empty-type paths
- bridge.html cache-busts bridge.js

## Live verify

```text
powershell -File scripts\verify-live.ps1
# LIVE health=200 home=200
# http://127.0.0.1:3000/
```

## Commit

`fix(filter): paste convert preserves selected list type`

## Out of scope / not touched

- Engine / parsers
- Filter lists / brain data
- Other Wave 2 tasks (Scrub CTA labels, accepted file types, etc.)
