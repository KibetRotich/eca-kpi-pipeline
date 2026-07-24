# VSLA Performance Assessment — dashboard pipeline

Keeps the **VSLA Performance** tile on `/output-insights` in sync with the live
KoboToolbox form **"VSLA PERFORMANCE ASSESSMENT TOOL"**
(asset `ahxgJ6SKAgF2Pz5tBWC4kp`). Same shape as `pipeline/cva/`.

```
fetch_vsla_json.py   Kobo JSON API  -> data/vsla_raw.json + data/vsla_formdef.json
transform.py         defensive clean -> data/clean_{groups,metrics,qualitative}.json
load_supabase.py     PostgREST upsert -> vsla_* tables (idempotent) + vsla_sync_meta
build_dashboard.py   transform.run() -> public/VSLA_Performance_Dashboard.html
                                      + data/vsla_group_metrics.csv (per-group index)
```

`transform.run()` is the single source of cleaning logic, shared by the Supabase
loader **and** the dashboard builder, so the database and the dashboard can never
diverge.

## Run locally

```bash
pip install -r pipeline/vsla/requirements.txt
KOBO_TOKEN=... python pipeline/vsla/fetch_vsla_json.py
python pipeline/vsla/transform.py            # prints counts + DQ summary
# .env.local supplies NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
python pipeline/vsla/load_supabase.py
python pipeline/vsla/build_dashboard.py
```

CI runs the same steps nightly (`.github/workflows/vsla.yml`, 04:00 UTC), commits
the regenerated `public/VSLA_Performance_Dashboard.html`, and the push triggers a
Vercel deploy. `data/` is gitignored (re-fetched every run; raw submissions are
never committed).

## Tables (Sprint 21 migration `pipeline/masp4_migration_sprint21_vsla_performance.sql`)

- `vsla_raw_submissions` — raw Kobo JSON (audit / reprocess), keyed on `kobo_id`.
- `vsla_groups` — one row per group assessment (identity, geography, dates).
- `vsla_metrics` — one row per group: all numeric/categorical facts + derived KPIs.
- `vsla_qualitative` — one row per (group × free-text field), theme-tagged + `sensitive`.
- `vsla_sync_meta` — last-sync tracker.
- Views: `v_vsla_overview`, `v_vsla_programme_totals`, `v_vsla_governance`,
  `v_vsla_linkage`, `v_vsla_qualitative_themes`.

## Data-quality handling (defensive, in `transform.py`)

- **Rate validation** — repayment / interest / default / welfare-% are kept as
  `*_raw` (as entered) plus a cleaned column clamped to `[0,100]`; anything outside
  that range (e.g. a default "rate" of `300000` UGX typed into a percentage field)
  is nulled in the cleaned column and surfaced via `dq_flags`, never silently trusted.
- **Decode-aware booleans** — some select_one lists encode *No* as the code
  `option_2`; booleans are decoded to labels before interpretation.
- **Group-prefix-robust field access** — Kobo prefixes data columns with the survey
  group path (`group_uh3oi66__…`); `pick()` matches on the `__`-separated suffix.
- **Country** — the form has no country field; set to the constant `Uganda`
  (ICAM/UCLAP VSLAs — parishes/sub-counties, UGX), documented rather than inferred.

## Qualitative & sensitivity

Free-text answers are rule-based theme-tagged (keyword buckets — small N; revisit
with embeddings if volume grows) into `theme` + keyword `tags`. Fields covering
**GBV / social-welfare-attributable** content (gender-related grievances, household
change narratives, welfare beneficiary profiles) — and any answer hitting a GBV
keyword — are marked `sensitive=true`. The dashboard's Qualitative Insights panel
shows sensitive excerpts **aggregated / non-attributable only** (no group or village
label), per the platform's do-no-harm convention.
