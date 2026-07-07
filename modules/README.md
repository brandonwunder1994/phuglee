# Distress OS Modules

Form Forge and Property Analyzer live **inside this repo** under `modules/`. Distress OS starts and proxies them — no junctions or separate clones required.

## Layout

| Module | Path | Port | Stack |
|--------|------|------|-------|
| Form Forge | `modules/form-forge` | 8787 | Python Flask |
| Property Analyzer | `modules/property-analyzer` | 3456 | Node.js |

## First-time setup

```powershell
# Shell
cd C:\path\to\phuglee
npm install

# Form Forge
pip install -r modules/form-forge/requirements.txt

# Property Analyzer
cd modules/property-analyzer
npm install
cd ../..
```

## Override paths (optional)

- `FORM_FORGE_PATH`
- `PROPERTY_ANALYZER_PATH`

## GSD verify

```powershell
npm run verify
```

Runs shell tests, Form Forge `gsd.py` tests, and Property Analyzer `npm test`.