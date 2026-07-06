# Distress OS Modules

Form Forge and Property Analyzer live in their own repos. Distress OS links to them here without copying code.

## Form Forge

**Source:** `C:\Users\brand\Projects\city-list-requests`

Create the junction (run once from an elevated prompt if needed):

```bat
mklink /J "%~dp0form-forge" "C:\Users\brand\Projects\city-list-requests"
```

Or set `FORM_FORGE_PATH` in the environment to point at your Form Forge folder.