# VSLA Performance Assessment — dashboard pipeline

Keeps the **VSLA Performance** tile on `/output-insights` in sync with the live
KoboToolbox form **"VSLA PERFORMANCE ASSESSMENT TOOL"**
(asset `ahxgJ6SKAgF2Pz5tBWC4kp`). Same shape as `pipeline/cva/`.

```
fetch_vsla_json.py   Kobo JSON API  -> data/vsla_raw.json + data/vsla_formdef.json
transform.py         defensive clean -> data/clean_{groups,metrics,qualitative}.json
ratios.py            metrics        -> 10 performance ratios per group
load_supabase.py     PostgREST upsert -> vsla_* tables (idempotent) + vsla_sync_meta
build_dashboard.py   transform.run() -> public/VSLA_Performance_Dashboard.html
                     + ratios.build()  + data/vsla_group_metrics.csv (per-group index)
```

## Performance ratios & parity with the platform

`ratios.py` is a Python port of **`lib/analytics/ratios.ts`**, which feeds
`/api/analytics` and the Next.js `AnalyticsPanel`. Both produce the same ten
ratios, so the static **Performance Ratios** tab and the platform dashboard can
never quote different numbers for the same group.

The port consumes `transform.run()`'s cleaned metrics rather than re-implementing
Kobo's fuzzy column lookup — that keeps `transform.py` the single source of
cleaning logic. Only the field-access layer differs; the arithmetic mirrors the TS,
including JS-style half-up rounding (Python's `round()` is half-to-even, which
would disagree in the last decimal on the signed `maturityScore`).

**Verify parity after touching either file** — this must print 0 mismatches:

```bash
node node_modules/typescript/bin/tsc lib/analytics/ratios.ts \
  --target es2020 --module commonjs --outDir "$TEMP/vsla_parity" --skipLibCheck
# then run ratios.build() over the same data and diff the two outputs per group
```

### The `_10b` skip trap (fixed 2026-07-26)

The form asks *"\_10b If not, how many positions are filled"* **only when** a group
answers NO to having all 8 leadership roles staffed. A fully-staffed group leaves
it blank or `0`. Reading `_10b` alone therefore scored **25 of 26 groups at 0/8**
leadership completeness and returned `null` gender-leadership ratios — and since
`leadershipCompleteness` is one of the four `maturityScore` z-score components, it
skewed the composite too. `resolve_leadership_filled()` (and
`resolveLeadershipFilled()` in the TS) reads the completeness gate first and only
falls back to `_10b`. **Any new skip-dependent follow-up field needs the same
treatment** — a blank in Kobo means "not asked", not "zero".

Note that with all 26 groups now complete, `leadershipCompleteness` has zero
variance, so its z-score is 0 for everyone and `maturityScore` is effectively
driven by the other three components. That is correct behaviour (no variance = no
signal), not a bug.

### Render check

`_render_check.js` stubs enough DOM + Chart.js to execute the generated
dashboard's inline script headlessly, render all ten tabs, and assert on the
ratios tab's chart configs. Run it after editing `dashboard_template.html`:

```bash
node pipeline/vsla/_render_check.js
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
