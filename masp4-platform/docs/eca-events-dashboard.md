# ECA Trainings & Events dashboard

Analytics for the **ECA Trainings and Events Tracker** Kobo form
(`aCt5s6EGUnE7UxJVeuXjpY`), built into the MASP IV platform: Next.js pages under
`/eca-events`, reading a Supabase database populated by a Python sync pipeline.

```
Kobo ──(MCP interactive │ REST cron)──► pipeline/eca-events ──► Supabase (eca_* tables)
                                                                     │  PII-free views + KPI views + RPC
                                                                     ▼
                                             app/eca-events (Next.js, chart.js) ──► Vercel
```

## Pages (`app/eca-events/`)
Overview · Geography · Gender & Youth · Projects & Commodities · Curriculum ·
Beneficiary Segments · Facilitators · Farmer Depth · Data Quality & M&E ·
Time & Planning · Data Dictionary. A persistent filter bar (date range,
country→admin1→admin2 cascade, project/commodity, event/training type,
include-test toggle) applies across every page via URL params, and an **Export
CSV** button downloads the currently-filtered (PII-free) events.

## Architecture
- **Data access** (`lib/eca-events/`): `filters.ts` (pure, tested helpers),
  `queries.ts` (reads ONLY the PII-free `v_eca_*_safe` / KPI views + the
  `eca_farmer_depth` RPC via the anon client; global filters map to one uniform
  PostgREST predicate; small dataset is paged past the 1000-row cap and
  aggregated in TS). Charts are chart.js/react-chartjs-2 (`app/eca-events/charts.tsx`).
- **Database** (`supabase/migrations/`): `0001` = base tables + PII-free safe
  views + KPI views + RLS (base tables locked to the service role); `0002` =
  filterable child views (child ⨝ events, no data duplicated) + the farmer-depth
  RPC. **Apply both in the Supabase SQL editor.**
- **Sync** (`pipeline/eca-events/`): see that folder's README. Idempotent upsert
  keyed on `submission_id`; interactive load via Kobo MCP, scheduled load via the
  REST GitHub Action (`.github/workflows/eca-events-sync.yml`, 3-hourly).

## Environment
Reuses the platform's Supabase env — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (dashboard reads), `SUPABASE_SERVICE_ROLE_KEY`
(sync writes). Sync also needs `KOBO_TOKEN`. GitHub Action secrets:
`KOBO_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Local development
```bash
npm install
npm run dev            # http://localhost:3000/eca-events
npm test               # frontend unit tests (filters)
# pipeline:
cd pipeline/eca-events && pip install -r requirements.txt && python -m pytest tests/ -q
```

## Deploy
Vercel auto-deploys the platform from `main`. First-time DB setup: run
`supabase/migrations/0001_*.sql` then `0002_*.sql` in the Supabase SQL editor,
set the GitHub Action secrets, then either wait for the 3-hourly sync or run
`python pipeline/eca-events/sync_supabase.py --source live` once.

## Adding a project / topic / commodity
Labels decode from `pipeline/eca-events/choices.json`. When Kobo adds a code,
regenerate that map from `get_form_content` (MCP) — the new project/topic/module
appears with its real label and flows into every page and filter automatically,
no code change. Until refreshed, unknown codes show a humanised fallback label.

## PII
Base tables (names, phone, IDs, disability) are RLS-locked to the service role.
The dashboard reads only PII-free views: identity is an anonymous hash for
dedup, disability is aggregate-only, enumerator names appear only as aggregate
counts. The Export CSV uses the same PII-free view.
```
