# NASA dataset record — complete before the demo

Status key: ✅ confirmed from NASA page · ❓ team must confirm

## Dataset identification
- Product title: NASA-SSH ENSO Sea Surface Height Indicator ✅
- Provider: NASA/JPL, PO.DAAC ✅
- DOI: 10.5067/NSIND-ENSV1 ✅
- Distribution format: ASCII text; the file `NASA_SSH_ENSO_INDICATOR.txt` is always the latest series ✅
- Official page: https://podaac.jpl.nasa.gov/dataset/NASA_SSH_ENSO_INDICATOR ❓ (open it and check)
- Date accessed: ❓
- Product version: Ver. 1 ✅

## NASA-only provenance check
- Indicator is computed from NASA-SSH Simple Gridded SSH (reference-missions-only) ✅
- Reference missions include TOPEX/Poseidon, Jason series, Sentinel-6 ✅
- Does the Space Apps rule allow data from missions with international partners? ❓
- Who verified, and when? ❓  → then set `verification` in metadata.json

## Variable definition (read the NASA-SSH User Guide)
- Exact variable name: ❓
- Unit: ❓  (do NOT guess; the UI shows "unit not confirmed" until filled)
- Meaning of positive / negative values: ❓
- Missing-value convention (fill value): ❓
- Spatial coverage: ❓
- Is this SSH-based indicator, NOT sea-surface temperature ✅ (never label it temperature)

## Workflow
1. Download the raw file into `raw/` (git-ignored). Keep it untouched.
2. `python scripts/ingest_nasa_ssh.py --input raw/NASA_SSH_ENSO_INDICATOR.txt --inspect`
3. Run the ingest with the right columns; spot-check 3-5 rows against the raw file.
4. Update `metadata.json`, set `accessed_on`, `unit`, `verification`.
