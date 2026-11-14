# API

| Endpoint | Description |
|---|---|
| `GET /api/health` | `{status: ok | waiting_for_data, dataset_loaded, rows}` (always HTTP 200) |
| `GET /api/metadata` | `metadata.json` + coverage (`rows, first_date, last_date, value_min, value_max, rows_dropped_*`) + `metadata_warnings` |
| `GET /api/data` | Observations. Query: `start`, `end` (`YYYY-MM-DD`, inclusive), `resample` = `none` \| `monthly` \| `yearly` (means) |

Errors are JSON `{ "error": "..." }` with HTTP 400 (bad input / unusable CSV) or 404 (CSV file missing).
`/api/data` returns `observations`, `count`, `summary` (of the returned window) and `query.note` stating whether values are originals or means.
