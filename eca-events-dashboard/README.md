# ECA Trainings & Events Tracker — Analytics Dashboard

Interactive analytics for the **ECA Trainings and Events Tracker** KoBoToolbox
form (Solidaridad East & Central Africa — Kenya, Uganda, Tanzania, Ethiopia).
Built with **Streamlit + pandas + plotly**, fed from the connected **KoBoToolbox
MCP server**.

Form UID: `aCt5s6EGUnE7UxJVeuXjpY` · ~6,750 event submissions and growing.

---

## Quick start

```bash
cd eca-events-dashboard
python -m pip install -r requirements.txt

# Runs immediately on the bundled synthetic dataset (no credentials needed):
streamlit run app.py
```

Open http://localhost:8501. Use the **sidebar global filters** (date, country →
admin-1 → admin-2 cascade, project/commodity, event/training type, and the
include-test toggle). They apply across every page.

To run against **real data**, refresh the cache first (see *Data refresh*), then:

```bash
ECA_DATA_SOURCE=cache streamlit run app.py    # bash
# PowerShell:  $env:ECA_DATA_SOURCE="cache"; streamlit run app.py
```

`ECA_DATA_SOURCE` = `auto` (default: cache if present, else synthetic) · `cache` · `synthetic` · `live` (fetch from KoBo via `KOBO_TOKEN`; used by the hosted deploy).

---

## Pages

| # | Page | What it shows |
|---|------|----------------|
| — | **Home** | Snapshot + how to read the numbers |
| a | **Executive Overview** | KPI cards, reach/events trend, event mix, country scorecard |
| b | **Geography** | Admin-level treemap heat map, GPS venue map (hexbin clustering), coverage-gap table |
| c | **Gender & Youth** | Gender/youth trends, gender × event-type, project parity ranking |
| d | **Projects & Commodities** | Reach by project/commodity, project league table, commodity bubble chart |
| e | **Curriculum & Content** | Top/bottom topics, curriculum-coverage gap, manual usage, Carbon Farming Academy modules, free-text word frequency |
| f | **Beneficiary Segments** | Type distribution, co-occurrence matrix, top organisations |
| g | **Facilitators** | Type mix, ToT/lead-farmer cascade ratio, facilitator:participant ratio |
| h | **Farmer-level Depth** | Unique vs raw vs reach, new/returning, session frequency, ID/phone capture |
| i | **Data Quality & M&E** | Test/real trend, missing-field audit, aggregate↔individual reconciliation, enumerator performance, timeliness |
| j | **Time & Planning** | Seasonality heat map, delivery cadence, upcoming pipeline |
| — | **Data Dictionary** | Field definitions, caveats, refresh + PII policy |

---

## Project structure

```
eca-events-dashboard/
├─ app.py                     # Streamlit entry (Home)
├─ config.py                  # form UID, field/group config, admin levels, PII, cache TTL
├─ choices.json               # code→label decode map (pluggable; see below)
├─ requirements.txt
├─ data_pipeline/
│  ├─ ingest.py               # source-agnostic ingestion (MCP cache / synthetic / httpx)
│  ├─ flatten.py              # canonicalise columns + flatten repeat groups
│  ├─ transform.py            # decode, explode multi-selects, dedup, derived fields
│  ├─ decode.py               # Decoder driven by choices.json (+ humanise fallback)
│  ├─ pipeline.py             # orchestrator → Dataset bundle
│  ├─ synthetic.py            # synthetic sample-data generator
│  ├─ sample_data/            # bundled synthetic dataset (offline dev)
│  └─ cache/                  # local raw-submission cache (gitignored)
├─ components/
│  ├─ data_access.py          # cached loader + global sidebar filters (page contract)
│  ├─ ui.py                   # page header, KPI cards, captioned charts, theming
│  └─ exports.py              # PII masking + CSV/Excel/PNG export
├─ pages/                     # the 11 dashboard pages
├─ tools/
│  ├─ refresh_data.py         # refresh submission cache
│  └─ refresh_choices.py      # regenerate choices.json from the live form
└─ tests/                     # pipeline unit tests + page smoke tests
```

---

## Data flow

```
KoBoToolbox  ──(MCP get_submissions, paginated)──►  cache/raw_submissions.json
                                                          │
        choices.json ◄──(MCP get_form_content)── form     │
              │                                            ▼
              └────────► data_pipeline: flatten → decode → explode → dedup → derive
                                                          │
                                                          ▼
                                    Dataset (events / participants / facilitators /
                                             selected_participants / multiselect)
                                                          │
                                          st.cache_data ──► Streamlit pages
```

The pipeline builds **tidy tables**, not one flat row per submission:

- `events` — one row per submission (canonical scalar columns + counts + derived fields)
- `participants` — one row per `participant[]` repeat item (demographics)
- `facilitators` — one row per `facilitator[]` repeat item
- `selected_participants` — long: known-farmer-list selections (`id__code` tokens)
- `multiselect[field]` — long explosion of `beneficiary_type` / `training_topic` / `training_modules`

---

## Data refresh (keeping the dashboard current)

Submissions arrive through the **connected KoBoToolbox MCP server** — the app
reads a local processed cache built from it. Two things can be refreshed:
**submissions** and the **choices/labels map**.

### 1. Submissions — primary path (MCP, via Claude Code)
Ask Claude Code to page through the MCP `get_submissions` tool
(`limit=5000`, increment `offset` until `next_offset` is null) and write the
combined rows with `data_pipeline.ingest.write_cache(rows, source="mcp")`
(helper: `tools/refresh_data.py:write_from_mcp_pages`). A full re-fetch of ~7k
rows is cheap, so no incremental logic is needed yet.

### 2. Submissions — headless/cron fallback (httpx)
Only when the MCP server isn't available (per the project brief):

```bash
export KOBO_TOKEN=...            # from KoBo → Account → Security → API key
python tools/refresh_data.py     # pages all rows, rewrites cache
```

### 3. Choices / labels
`choices.json` is the pluggable code→label map. **Until it is regenerated from
the live form it ships as a _provisional_ map** (a banner shows this) — unknown
codes fall back to a humanised form of the code, so nothing is blocked.

To load the authoritative map:
- **MCP path:** call `get_form_content("aCt5s6EGUnE7UxJVeuXjpY")`, save the JSON,
  then `python tools/refresh_choices.py --from-json <payload.json>`.
- **httpx fallback:** `KOBO_TOKEN=... python tools/refresh_choices.py`.

`st.cache_data` (TTL 1 h, set via `ECA_CACHE_TTL`) serves the new data after a
refresh; use the app's "Rerun / Clear cache" to force it immediately.

---

## Pointing at a new form / adding a project or topic

- **New form or KoBo account:** set `FORM_UID` in `config.py`; set `KOBO_TOKEN`
  / `KOBO_URL` env vars (or use the MCP server's config). Re-run both refresh
  tools. Because column names are derived from the data (group prefixes stripped
  automatically) and labels from `choices.json`, most form revisions need **no
  code change**.
- **New project / commodity / topic added in KoBo:** just re-run
  `tools/refresh_choices.py` — the new codes get their real labels; no code
  edit. (Before refreshing, new codes still appear, humanised.)
- **New repeat group or multi-select field:** add it to `REPEAT_GROUPS` /
  `MULTISELECT_FIELDS` in `config.py`.
- **Carbon Farming Academy modules:** driven by the `training_modules` choice
  list — refreshing choices updates the module tracker automatically.

---

## PII protection

Enforced centrally in `components/exports.py`:

- Phone numbers, Beneficiary IDs, National IDs → **masked**.
- Participant & facilitator names → **dropped** from shared views/exports.
- **Disability** → aggregate only, never row-level.
- Row-level PII is available **only** behind the sidebar *Restricted detail*
  gate (authorised 1:1 verification) and never leaves in a shared export unless
  explicitly unlocked.

---

## The total-vs-individual caveat (important)

`total_participants` (reported headcount) is **not** the number of individually
recorded participants. The dashboard surfaces three distinct denominators and
never conflates them:

`Reported reach (Σ total_participants) ≥ raw individual records ≥ unique farmers (deduped)`

Demographic charts are labelled with their sample `n`. See the **Data
Dictionary** page for full definitions and known limitations (free-text dedup,
version drift, no choropleth boundaries, etc.).

---

## Testing

```bash
python -m pytest tests/ -q
```

- `test_pipeline.py` — choice decoding, multi-select explosion, repeat-group
  flattening + join, farmer dedup / identity flagging, derived fields, test
  filtering, version-drift tolerance.
- `test_app_smoke.py` — runs `app.py` and every page through Streamlit's
  `AppTest` against the synthetic dataset and asserts no page raises.

---

## Deployment

The app is a **live Streamlit server** (not a static HTML file), so it is hosted
on **Streamlit Community Cloud** and embedded into the Solidaridad platform
(`ecadata.solidaridadnetwork.org/output-insights`) via an `<iframe>` — as a
section directly after the Climate Heroes / REAP dashboard. **See
[`DEPLOY.md`](DEPLOY.md) for the exact step-by-step.**

In short:

1. Deploy on Community Cloud from `KibetRotich/eca-kpi-pipeline`, main file
   `eca-events-dashboard/app.py`.
2. Set secrets: `KOBO_TOKEN`, `KOBO_URL`, `ECA_DATA_SOURCE=live`. The app pulls
   live from KoBo; `st.cache_data` (TTL 1 h) keeps re-fetches down to hourly.
3. Set `NEXT_PUBLIC_EVENTS_DASHBOARD_URL` (the `*.streamlit.app` URL) on the
   platform's Vercel project. The page appends `?embed=true` automatically so
   Streamlit's chrome is hidden and framing is permitted.
4. Refresh is automatic (TTL); a push to `main` redeploys the app.

> Access note: Streamlit has no built-in auth and a Community Cloud public app
> is reachable by URL — keep the URL unpublished (the intended entry point is
> the auth-gated platform page). Row-level PII stays behind the sidebar
> *Restricted detail* gate regardless. For hard access control, host on Cloud
> Run behind the platform network instead.
>
> Alternative pattern: the platform's other dashboards (Seedlings) are
> **static HTML rebuilt nightly by a GitHub Action** and served from
> `masp4-platform/public/`. This Streamlit app could be rebuilt as such an
> artifact too, but that is a separate self-contained HTML/JS build.

---

## Notes

- Built and validated against the live form schema (via the MCP `get_form_info`
  / `get_form_content` tools) and a synthetic dataset that reproduces the real
  shape (nested repeats, coded values, form-version drift, real/test mix).
- Requires the read-only `get_form_content` tool added to the KoBo MCP server
  (`MCP/kobo_mcp.py`) — load it by restarting Claude Code.
```
