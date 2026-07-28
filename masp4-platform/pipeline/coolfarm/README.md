# Cool Farm (CFP) crop-assessment dashboard — pipeline

Kobo form `a4AC6PCXs4QFs3KBym8KKS` — "ECA CFP Crops Assessments" → Supabase `cfp_*`
→ static `public/Cool_Farm_Dashboard.html`, listed as a tile on `/output-insights`.

Same shape as `pipeline/vsla/` and `pipeline/cva/`.

## Scope

Reports **practice adoption and derived input intensities**. It deliberately does
**not** report CO₂e: the source form carries no emission factors (`gwp` is a single
constant, `IPCC_AR6`), and energy (4.3% of farms), irrigation (0.6%) and explicit
fertiliser nitrogen (0.5% of applications) are far too sparse to support a
defensible footprint. Derived intensities are stored so a Cool Farm calculation
layer could be added later without reprocessing.

## Run order

```bash
# 1. schema (once, per environment) — run in the Supabase SQL editor
#    masp4_migration_sprint23_coolfarm.sql
#    masp4_migration_sprint23_coolfarm_views.sql

# 2. sync Kobo -> Supabase
python pipeline/coolfarm/sync_supabase.py --full     # backfill
python pipeline/coolfarm/sync_supabase.py            # incremental (nightly)

# 3. rebuild the dashboard
python pipeline/coolfarm/build_dashboard.py

# 4. verify before committing
node pipeline/coolfarm/_render_check.js
```

Requires `KOBO_TOKEN`, `KOBO_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. `load_env()` searches upward for `.env.local`.

**Re-run `--full` after editing `transform.py`** — derived columns are computed at
load time, not query time.

## Files

| File | Role |
|---|---|
| `transform.py` | pure transform: unit normalisation, N-parsing, DQ rules |
| `sync_supabase.py` | Kobo → Supabase, backfill + incremental |
| `build_dashboard.py` | Supabase → static HTML (build-time data embed) |
| `dashboard_template.html` | the dashboard: 13 sections, client-side filtering |
| `_render_check.js` | headless render + dataviz-rule assertions |
| `tools/fetch_kobo.py` | one-shot bulk extract to local JSON (profiling) |
| `tools/profile_json.py` | local profiler (`struct\|groups\|cats\|nums\|residues\|repeats\|dq`) |
| `tools/profile_export.py` | superseded CSV profiler, kept as the record of a dead end |
| `analytics-inventory.md` | Phase 1: field-by-field analytics inventory |
| `data-architecture.md` | Phase 2: schema, normalisation, views, sync |
| `phase1-method.md` | method + API gotchas |

## Things that will bite you

- **Kobo caps a page at 1,000 rows** regardless of `limit`; drive pagination off
  `count`, not page size.
- **PostgREST also caps responses at 1,000 rows** — `len(body)` silently
  under-reports totals. Use the `Content-Range` header (`sb_count()`).
- **The Kobo CSV export is unusable here**: it uses question *labels* as headers
  (six columns are literally named `Burn (%)`) and drops every repeat group. Use
  the REST API.
- **Key separator differs by source**: REST emits `group/field`, the Kobo MCP
  tools emit `group__field`. `transform.get()` accepts either.
- `yield_est_year_0..30` are **% of peak yield, not tonnes**, and are largely
  generic templates — 85% of farms report a mature crop with a year-0 of 0. That
  is why no yield-trend chart exists.
- `pruning_est_year_*` are dead columns (`pruning_option` is `constant_value` for
  100% of rows).
- Fertiliser N comes from **parsing the product label** (`"Cattle manure - 0.6% N"`),
  not the dedicated `fertiliser_n_*` fields (11 of 2,099 rows).
- Shade-tree labels need the `Torpical` → `Tropical` fix (413 entries).

## Disclosure control

`public/*.html` is gated only by an **unverified cookie pre-filter** in `proxy.ts`
— not by `requireOrgSession()` — and this repo is currently public. So the built
file deliberately contains:

- **no** farmer names, phone numbers, villages or sub-counties
- **no** coordinates on any farm row (district is the finest per-row geography)
- enumerators **pseudonymised** to `E01…E56`
- locations only as **~2.2 km grid cells** with cells of fewer than 3 farms suppressed

`build_dashboard.py` asserts all of this and aborts the build if anything
identifying appears in the payload. Keep that guard.

The Supabase side is stricter still: `cfp_*` tables require an authenticated
session (`auth.uid() is not null`), all `v_cfp_*` views are
`security_invoker = true`, and `cfp_raw_submissions` has RLS enabled with **no**
select policy — service role only. This diverges from `cva_`/`vsla_`, which allow
anonymous select; see `data-architecture.md` §5 for why.

## Scheduling

Not yet wired. The sibling ETLs run on **GitHub Actions cron**, not Vercel cron,
which keeps the service-role key out of the web app's runtime. Follow that.
Monthly is ample — the cohort has gained one submission since February 2025.
