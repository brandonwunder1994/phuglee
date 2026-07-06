# Distress OS Modules

Form Forge and Property Analyzer live in their own repos. Distress OS links to them here without copying code.

## Form Forge

**Source:** `C:\Users\brand\Projects\city-list-requests`

```bat
mklink /J "%~dp0form-forge" "C:\Users\brand\Projects\city-list-requests"
```

## Property Analyzer

**Source:** `C:\Users\brand\Projects\property-distress-analyzer`

```bat
mklink /J "%~dp0property-analyzer" "C:\Users\brand\Projects\property-distress-analyzer"
```

Or set environment variables:

- `FORM_FORGE_PATH`
- `PROPERTY_ANALYZER_PATH`