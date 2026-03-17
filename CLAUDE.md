# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Solidaridad East Central Africa (ECA) KPI Dashboard** — an automated reporting pipeline for the MASP III programme (2021–2025) covering Kenya, Uganda, Tanzania, Ethiopia, and Congo. It is not a traditional software project.

## Local Development

Serve the dashboard locally (required — `fetch()` won't work over `file://`):
```bash
python -m http.server 8080
# then open http://localhost:8080
```

Run the ETL pipeline manually:
```bash
# Requires GOOGLE_CREDENTIALS and SHEET_ID env vars set
GOOGLE_CREDENTIALS=path/to/service_account.json SHEET_ID=<id> python pipeline/etl.py
```

Install pipeline dependencies:
```bash
pip install -r pipeline/requirements.txt
```

## Architecture

### Data flow
```
Salesforce CSV export
  → drop in data/
  → git push
  → GitHub Actions runs pipeline/etl.py
  → Google Sheets updated (Sheet ID: 1jKLh53hKZ_UVsqHnqiTQmQO4sq39ryrdZPlGwNTebic)
  → Netlify redeploys ECA_Dashboard.html
  → live dashboard refreshes
```

### ECA_Dashboard.html
Single-file dashboard (~1.2 MB). The entire app lives here — HTML, CSS, and JavaScript in one file. Key architectural pieces:

- **`const RAW = [...]`** (line ~440) — full dataset embedded at build time as a JS array. The dashboard loads this instantly and also attempts `fetch(CSV_PATH)` to refresh from the CSV file; if the fetch fails it falls back to the embedded data.
- **`PILLAR_KPI_GROUPS`** — maps the four result area keys (`gap`, `sbe`, `epe`, `mu`) to their KPI name arrays. KPI names must match the CSV exactly (they are used as lookup keys against `r.kpi_name`).
- **`applyFilters()`** — master render function. Called on startup and on every filter change. Stagger-renders all four pillars with `setTimeout` (300 ms apart) to avoid spawning 50+ canvases simultaneously.
- **`renderPillar(pillar, data)`** — renders KPI bubble row + by-year bar charts + by-country bar charts for one result area.
- **`generateInsights(pillar, data)`** — dynamic decision box: computes overall %, trend direction, worst KPI, worst country, worst project, then injects strategic recommendation text.
- **`tgtDatasets(tgt, ach, color)`** — shared chart dataset builder. Target bar = `#111111`, achievement bar = `Y` (`#FFC800`).
- **`shortName(s)`** — display-only KPI label cleaner. Does NOT affect data lookups.
- **Netlify Identity auth** — login gate is active on Netlify; bypassed automatically on `localhost`/`127.0.0.1`.

### pipeline/etl.py
Four-stage ETL: Extract (read latest CSV from `data/`) → Transform (rename columns, filter to `PRIORITY_KPIS`, coerce numerics) → Aggregate (by year / country / commodity) → Load (write to 5 Google Sheet tabs). `PRIORITY_KPIS` and `PILLAR_KPI_GROUPS` in the dashboard must be kept in sync.

### GitHub Actions (`.github/workflows/etl.yml`)
Triggers: push to `data/*.csv`, daily at 05:00 EAT (02:00 UTC), or manual dispatch. Requires two repository secrets: `GOOGLE_CREDENTIALS` (service account JSON) and `SHEET_ID`.

### Netlify (`netlify.toml`)
No build step — publishes the repo root. `/` redirects to `/ECA_Dashboard.html`. Cache-Control set to no-cache so colleagues always get the latest version.

## Key Data Facts

- **CSV schema:** `kpi_name, indicator_id, commodity, net_achievement, net_annual_target, stakeholder_disaggregation, results_new, results_continued, targets_new, targets_continued, year, project_name, country`
- **Years in scope:** 2021–2025 (controlled by `VALID_YEARS`)
- **Countries:** Kenya, Uganda, Tanzania, Ethiopia, Congo
- **Known data quirk:** `# of farmers with improved yield (kg/ha))` has a double `)` in the source CSV — this is intentional and must be preserved in `PILLAR_KPI_GROUPS` to match.

## Chart Library

Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0, both loaded from CDN. All chart instances are registered in `charts{}` and destroyed via `dc(id)` before redraw to prevent canvas reuse errors. Insight box donuts use a separate `_insightCharts{}` registry.
