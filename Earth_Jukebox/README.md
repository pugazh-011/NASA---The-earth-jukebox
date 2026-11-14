# Earth Jukebox — El Niño Edition

Interactive web app that shows a NASA El Niño / ENSO data record as a time-series
chart and plays it as piano notes, with chart cursor and sound driven by the same clock.

**Data rule:** NASA datasets only. Nothing in this repository is invented data:
`data/nasa_enso.csv` ships with a header only. Tests use tiny synthetic fixtures that
exist only in temporary folders while the tests run.

## Architecture

```
NASA text file ──► scripts/ingest_nasa_ssh.py ──► data/nasa_enso.csv
                                                       │
                      Flask API (backend/app) ◄────────┘  validates, filters, resamples
                              │  JSON
                              ▼
   Browser:  api.js → chartView.js (Chart.js)
                    → mapping.js (value → note) → player.js (clock) → synth.js (Web Audio)
```

| Layer | Files | Responsibility |
|---|---|---|
| Ingest | `scripts/ingest_nasa_ssh.py` | Convert the raw NASA text file to `date,value` CSV without changing values |
| Data access | `backend/app/repository.py` | Strict parsing, cleaning report, date filter, labelled resampling, auto-reload |
| API | `backend/app/api.py` | `/api/health`, `/api/metadata`, `/api/data` |
| Mapping | `frontend/js/mapping.js` | Pure, tested value→MIDI/velocity rules (fixed range) |
| Playback | `frontend/js/player.js` | Look-ahead scheduling on the audio clock; pause/stop; cursor sync |
| Sound | `frontend/js/synth.js` | Additive piano-like synth (not a sampled piano) |
| UI | `frontend/` | Dashboard, controls, transparency panel, credits |

## Run on Windows 10 (PowerShell, in the project folder)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1        # if blocked: use  .venv\Scripts\activate.bat  in cmd
pip install -r requirements-dev.txt
python backend/run.py
```
Open http://127.0.0.1:5000. With the empty CSV the page says "Waiting for data" — that is correct.

## Get real NASA data in (do this in order)

1. Open the dataset page (URL in `data/metadata.json`), read the **User Guide**, and fill `data/DATASET_NOTES.md`
   (unit, meaning of sign, fill value, access date). Resolve the NASA-only question with your mentors/organisers.
2. Download `NASA_SSH_ENSO_INDICATOR.txt` into a `raw/` folder (git-ignored). An Earthdata login may be required.
3. Look at it: `python scripts/ingest_nasa_ssh.py --input raw/NASA_SSH_ENSO_INDICATOR.txt --inspect`
4. Convert it, naming the columns you saw:
   `python scripts/ingest_nasa_ssh.py --input raw/NASA_SSH_ENSO_INDICATOR.txt --date-col 0 --value-col 1`
   (add `--fill-value <number>` if the guide defines a missing-data code; `--date-cols Y M D` if the date is split).
5. Spot-check 3–5 rows against the raw file. Then set `unit`, `accessed_on` and `verification` in `data/metadata.json`.
   The yellow warning banner on the site disappears only when this is complete.

## Tests

```powershell
python -m unittest discover -s tests -v     # backend + ingest (stdlib only)
npm run test:js                             # mapping + player (needs Node 20+; no packages to install)
```

## Team workflow (Git)

One feature per branch (`git switch -c feature/chart-zoom`), small commits, pull request, someone else reviews.
Suggested ownership: Coder 1 → `frontend/` (UI, chart); Coder 2 → `backend/`, `mapping.js`, `player.js`, `synth.js`;
Researcher → `data/metadata.json`, `DATASET_NOTES.md`, the Science section text; Presenter → demo script using `docs/`.

## Known limitations (state these in the demo)

- Sound is synthesised, not sampled piano. Swap `synth.js` for a sampler later (same two methods).
- Chart.js and Google Fonts load from CDNs: download Chart.js into `frontend/vendor/` before the live demo.
- One variable only. No El Niño/La Niña labelling of dates, because the sign convention and thresholds must come from NASA docs.
- Flask dev server is for local use; for deployment use `waitress` (`waitress-serve --listen=0.0.0.0:8000 wsgi:app` from `backend/`).
