# Tree-Survival Dashboards Pipeline (Harvesting Carbon / SAVE KE)

Two **separate** cohort dashboards for Kobo tree-survival monitoring, embedded in
`/output-insights`. Kept separate by design — different countries, species sets,
and survey grain, so survival is **never pooled** across them.

| Cohort | Kobo form | Grain | Dashboard |
|---|---|---|---|
| Uganda — Harvesting Carbon | `aVfWPw45B9gB46AEJXVHwS` (`Harvesting_Carbon_Tree_Survival_Assessment_v26_02_21`) | Batch (species pooled per visit) | `public/HC_Survival_UG_Dashboard.html` |
| Kenya — SAVE KE | `ahSMK3J7qQngQnXd76JkzF` | Species repeat (`survival_rate`) | `public/SAVE_KE_Survival_Dashboard.html` |

## Flow

```
fetch_survival_json.py   Kobo JSON API (preserves Form 2 repeat) -> data/*.json
        │
transform.py             defensive clean + reshape -> data/clean_submissions.json
        │                                             data/clean_species.json
        ├── load_supabase.py   upsert -> hcs_raw_submissions / hcs_submissions / hcs_species
        │                      + stamp hcs_sync_meta   (migration: pipeline/masp4_migration_sprint18_hc_survival.sql)
        └── build_dashboard.py rebuild both public/*.html (KPIs+filters default; Insights tab secondary)
```

`transform.py` is the single source of cleaning logic, shared by the loader and the
dashboard builder, so Supabase and the dashboards can never diverge.

## Defensive DQ handling (baked into `transform.py`)

Per the Phase-2 decision, data problems are fixed in the pipeline, not at source:

- **farmer_lookup_ok** — flags rows where the `select_one_from_file` registry lookup didn't resolve.
- **transport_clean** — Kenya's free-text transport (40+ spellings) recoded to a controlled list.
- **geo_in_bounds** — GPS validated against the country bounding box; `gps_missing` flagged.
- **cooperative** — "Not provided"/blank variants collapsed to `NULL`.
- **impossible values** — `alive` clipped to `planted`; survival clipped to `[0,1]`.
- **reason_death_bucket** — free-text death reasons bucketed (drought / livestock / theft / …).
- **dq_flags** — per-row issue list, surfaced (kept in the table & shown on the Data-quality tab), never silently dropped.

## Run locally

```bash
cd masp4-platform
pip install -r pipeline/hc_survival/requirements.txt
export KOBO_TOKEN=...                      # KoBoToolbox API token
python pipeline/hc_survival/fetch_survival_json.py
python pipeline/hc_survival/transform.py
python pipeline/hc_survival/load_supabase.py     # reads .env.local for Supabase keys
python pipeline/hc_survival/build_dashboard.py
```

## Scheduled sync

`.github/workflows/hc_survival.yml` — nightly 03:20 UTC (+ on pipeline change / manual).
Runs fetch → transform → load Supabase → rebuild → commit the two HTML files.
Secrets required: `KOBO_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Supabase objects (Sprint 18)

Tables `hcs_raw_submissions`, `hcs_submissions`, `hcs_species`, `hcs_sync_meta`;
views `v_hcs_cohort_kpi`, `v_hcs_species_kpi`, `v_hcs_location_kpi`. All additive,
RLS read-all / authed-writes (platform convention). Apply
`pipeline/masp4_migration_sprint18_hc_survival.sql` (idempotent).

## Deploy note

The live platform deploys from the **private org repo** `solidaridad-eca/masp4-platform`,
and pushes to `main` there trigger Vercel. If auto-deploy is not wired, deploy manually
with `npx vercel --prod --yes` from the repo root after the dashboards are rebuilt.
