# Cool Farm Dashboard — Data Architecture (Phase 2)

**Status:** built and loaded. 3,254 submissions live in Supabase, all counts reconciled against the Phase 1 profile.
**Target:** `MASPIV_Platform` (`qzvkhocrmpvegmawrlkg`), table prefix `cfp_`, Sprint 23.
**Scope:** practice-adoption + derived intensities (approved option **a**), plus geospatial analytics.

---

## 1. Why this project, this prefix

`MASPIV_Platform` already hosts three Kobo-sourced dashboards built on an identical pattern — `hcs_` (Sprint 18), `cva_` (Sprint 19), `vsla_` (Sprint 21) — each with `<prefix>_raw_submissions`, `<prefix>_sync_meta`, domain tables and `v_<prefix>_*` views. Cool Farm is the same shape, so it reuses the convention rather than starting a fourth pattern: one auth/role system, one set of env vars, one deployment.

Deviation from the siblings is limited to one thing, deliberately: **RLS** (§5).

---

## 2. Table map

16 tables. One parent, twelve children, a DQ table, a raw landing zone, sync bookkeeping.

```
cfp_raw_submissions          verbatim Kobo JSON (PII-stripped) — replay source
  └── cfp_submissions        1 row per assessed farm  ← the spine
        ├── cfp_residue_fates            130,160   9 streams × fates, LONG
        ├── cfp_yield_curve               97,328   31 year-offsets, LONG
        ├── cfp_fertilizer_applications    2,099
        ├── cfp_transport_use              3,578
        ├── cfp_intercrops                 2,835
        ├── cfp_shade_trees               2,343
        ├── cfp_pesticide_applications    1,062
        ├── cfp_land_use_change             906
        ├── cfp_hedges                      416
        ├── cfp_energy_use                  113
        ├── cfp_irrigation_use               13
        ├── cfp_wastewater_treatments         1
        └── cfp_dq_flags                  7,304
cfp_sync_meta                singleton high-water mark
```

Every child is `references cfp_submissions(submission_id) on delete cascade`, so a submission can be re-processed by deleting one parent row.

### Three shape decisions worth flagging

**Residues are stored long, not wide.** The form has 43 residue columns (9 streams × 3–6 fates). Kept wide they would need a 43-branch `CASE` in every query; stored as `(submission_id, stream, fate, pct)` the flagship 100%-stacked chart is a single `GROUP BY stream, fate`. This is the one place the schema intentionally departs from the source layout beyond what the brief specified.

**The yield curve is reshaped but carries a health warning.** `cfp_yield_curve` holds the required wide→long reshape. Its column is named `pct_of_peak`, not `yield`, and both the table and its view carry a `COMMENT` stating that these are lifecycle template values, not farm performance — 2,778 farms (85.4%) report a mature crop with a year-0 value of 0.

**The pruning year-columns were *not* reshaped.** The brief called for it, but `pruning_option = constant_value` for 100% of submissions, so the 31 `pruning_est_year_*` columns are dead (29 stray rows from superseded form versions). The two scalars that *are* populated — `pruning_constant_val`, `pruning_start_year_offset` — live on the parent. This avoided a 31-column table holding nothing.

---

## 3. Normalisation applied at load

All conversions happen in `pipeline/transform.py`. **The raw value and its original unit are always retained** next to the normalised column, so any conversion is auditable.

| Quantity | Source units | Stored as | Conversion |
|---|---|---|---|
| Growing area, reforested area | acres (3,003) / hectares (251) | `area_ha`, `de_area_ha` | × 0.404686 for acres |
| Plant / tree / intercrop density | per acre / per hectare | `plants_per_ha`, `density_per_ha` | × 2.471054 for per-acre |
| Fertiliser rate | 6 units: kg·t·l × acre·ha | `rate_kg_per_ha` | t→kg ×1000; acre→ha ×2.471054 |
| Pesticide rate | 5 units | `rate_per_ha` | as above |
| Transport weight | kgs (2,996) / tonnes (582) | `weight_kg` | t→kg ×1000 |
| Irrigation volume | litres (11) / m³ (2) | `water_added_m3` | l→m³ ÷1000 |

Litres are carried 1:1 as kg where a mass rate is needed — the product density is unknown, so the row is **flagged `unit_suspect`** rather than silently corrected.

### Value cleaning
- `shade_type`: `Torpical*` → `Tropical*` (**413 instances**); `shade_type_raw` preserved
- `crop_type`: `cocoa_monocrop` → `cocoa monocrop`; also derives `crop_species` and `crop_system`
- `enumerator`: trimmed, whitespace-collapsed, title-cased → **79 raw strings resolve to 56 people**
- `energy_use_category`: `select_multiple` split on whitespace into `text[]`
- Year-offset fields where a calendar year was typed instead: `>1900` reinterpreted as calendar and converted back to an offset; results outside 0–30 discarded rather than guessed

---

## 4. Derived intensity metrics

The approved middle tier: physically meaningful, no emission factors, and precisely the quantities a future Cool Farm calculation would consume.

| Metric | Column | Coverage | Definition |
|---|---|---|---|
| **kg N / ha** | `n_kg_per_ha` | 1,569 farms | Σ(`rate_kg_per_ha` × `n_pct`/100) over applications |
| P₂O₅, K₂O / ha | `p2o5_kg_per_ha`, `k2o_kg_per_ha` | 1,569 | as above |
| Organic share | `organic_fert_share` | 1,569 | share of applications whose type is manure/digestate/slurry/compost/litter |
| **AI load** | `ai_kg_per_ha` | 930 | Σ(rate × AI% × field%) |
| **tonne-km** | `tonne_km` | 3,254 | Σ(`weight_kg`/1000 × `distance_km`) |
| **Yield intensity** | `yield_t_per_ha` | 3,254 | `total_yield_t` ÷ `area_ha` |
| **Burn share** | `residue_burn_share` | 3,254 | mean burn % across the **6 burn-capable streams only** |
| Shade / intercrop cover | `shade_cover_perc`, `intercrop_cover_perc` | 2,237 / 2,165 | Σ cover % |
| Net forest area | `net_forest_area_ha` (view) | 321 | reforested positive, deforested negative |

### How the N problem was solved
The explicit `fertiliser_n_*` fields are populated in **11 of 2,099** rows (they only unlock for `category = compose_own`). N/P/K are instead parsed from the `fertiliser_type` **label** — `"Cattle manure - 0.6% N"`, `"Compound NPK - 15% N / 15% K2O / 15% P2O5"`, `"Ammonium sulphate nitrate - 26%N"`. Coverage: **1,655 of 2,099 instances (78.8%)** versus 11. Regex `([\d.]+)\s*%\s*N(?![A-Za-z0-9])`, so `29%CaO` and `45% SO3` correctly yield nothing. Explicit fields are still stored alongside for the 11 rows that have them.

**Rollups are stored on the parent, not computed per query.** With ~3.2k farms the staleness risk is nil (the ETL recomputes on every run) and it keeps the dashboard's filter-then-aggregate path to a single table.

---

## 5. Security & PII

**Names and phone numbers are never loaded** — not into `cfp_submissions`, and stripped from the JSON before it reaches `cfp_raw_submissions`. Verified: `0` rows in the raw table contain `farmer_first_name`, `farmer_other_names`, `phone_number` or `instanceName`, and `0` columns in the parent match a name/phone pattern.

**Precise GPS is stored** (geospatial analytics were requested) but never served raw: `v_cfp_geo_points` rounds to 3 dp (~110 m) and omits `village_raw`.

**RLS — deliberate divergence from the siblings.** `cva_`/`vsla_` tables allow anonymous `SELECT` (`using (true)`). That is not appropriate here: this dataset pairs precise coordinates with gender, age, disability and household size for 3,254 individuals, which is a re-identification risk. So:

| Object | Access |
|---|---|
| `cfp_raw_submissions` | RLS on, **no policy** → service role only |
| all other `cfp_*` tables | `SELECT` requires `auth.uid() is not null` |
| all `v_cfp_*` views | `security_invoker = true` → the caller's RLS applies |

`security_invoker = true` matters: without it a view runs with its owner's rights and becomes a way around the base table's RLS. Consequence — **no `v_cfp_*` view appears in the Supabase linter's `security_definer_view` errors**, whereas all 40+ pre-existing `v_eca_*`, `v_cva_*`, `v_vsla_*`, `v_hcs_*` views do. The only `cfp_` advisor notice is the intentional INFO for the policy-less raw table.

> Pre-existing, out of scope, flagged for your awareness: ~40 sibling views are `SECURITY DEFINER`; four functions have mutable `search_path`; leaked-password protection is off. None are Cool Farm's doing and none were touched.

---

## 6. Views

Two shapes, chosen per tile rather than one view per chart.

**Row-grain, filterable** — carry `project / region / district / crop / gender / month` on every row so the dashboard filters once and re-cuts any tile without new SQL:

| View | Grain |
|---|---|
| `v_cfp_farm_analytics` | **the primary source** — 1 row/farm, all dimensions + all derived metrics + DQ counts |
| `v_cfp_residue_long` | farm × stream × fate |
| `v_cfp_fertilizer_long`, `v_cfp_pesticide_long`, `v_cfp_transport_long` | one row per application/trip |
| `v_cfp_agroforestry_long` | intercrop + shade + hedge unioned (`kind`, `species`, `cover_perc`) |
| `v_cfp_land_use_long`, `v_cfp_rare_inputs` | per record |
| `v_cfp_dq_by_submission` | 1 row/farm with flag counts + codes |

**Pre-aggregated** — where the aggregate *is* the tile:

| View | Purpose |
|---|---|
| `v_cfp_overview` | the KPI strip, single row |
| `v_cfp_residue_mix`, `v_cfp_burn_summary` | default residue chart + burn headline |
| `v_cfp_land_use_transitions` | Sankey / matrix source |
| `v_cfp_yield_curve` | lifecycle curve (carries the caveat comment) |
| `v_cfp_dq_summary`, `v_cfp_field_activity` | DQ tile, enumerator/month activity |
| `v_cfp_categorical_counts` | one unpivoted view replacing ~10 near-identical breakdown views |

Regular views, not materialised: at this data volume they are always fresh and fast enough, and there is no refresh job to forget.

### Geospatial layer
| View | Use |
|---|---|
| `v_cfp_geo_points` | point map; coords rounded to ~110 m |
| `v_cfp_district_geo` | 27 districts — centroid + every metric in one row, so the choropleth switches metric without refetching |
| `v_cfp_region_geo` | 7 regions, same shape |
| `v_cfp_geo_outliers` | **distance from each farm to its own district's centroid** |

PostGIS is not installed, so distance is haversine in plain SQL. District *boundaries* aren't available either — but distance to the district's own centroid is enough to rank suspects, and it works: **8 farms sit >50 km from their stated district's centroid, the worst at 206 km**, which almost certainly means a mis-selected district rather than a real journey.

---

## 7. Sync

`pipeline/sync_supabase.py`:

```bash
python pipeline/sync_supabase.py --full                             # backfill
python pipeline/sync_supabase.py                                    # incremental
python pipeline/sync_supabase.py --from-file data/raw/submissions.json
python pipeline/sync_supabase.py --dry-run                          # transform only
```

**Incremental** queries Kobo with `_submission_time >= (cfp_sync_meta.last_submitted_at − 2 days)`. The overlap exists because **Kobo submissions can be edited after the fact and an edit keeps the same `_id`** — an id-only high-water mark would silently miss it. Reprocessing a 2-day overlap is cheap and idempotent: parents upsert on `kobo_id`; children are deleted and reinserted for exactly the submissions in scope. It never re-pulls the full set unless asked.

Run `--full` after changing `transform.py`, since derived columns are computed at load time.

Two API quirks the script encodes (both cost a debugging round trip):
- **Kobo caps a page at 1,000 rows regardless of `limit`**, so page size cannot be the loop-termination signal — it drives off `count`.
- **PostgREST caps a response at 1,000 rows**, so `len(body)` under-reports totals. Row counts come from the `Content-Range` header via `sb_count()`.

### Scheduling
Not yet wired. The sibling ETLs run as **GitHub Actions cron, not Vercel cron** — that's the pattern to follow, and it keeps the service-role key out of the web app's runtime.

---

## 8. Verification

Every load figure was reconciled against the independent Phase 1 profile:

| Check | Result |
|---|---|
| Parent rows | 3,254 = submission count ✓ |
| All 12 child-table counts | identical to the Phase 1 repeat-group profile ✓ |
| Residue rows | 130,160 = 3,254 × 40 real fate fields ✓ |
| Total area | 2,549.2 ha, matches the independent local computation ✓ |
| Districts / regions / enumerators | 27 / 7 / 56 ✓ |
| `v_cfp_overview` headline % | female 33.8, coop 85.7, shaded 89.6, fertiliser 50.3, pesticide 29.6, shade trees 78.6, intercrop 71.4, irrigated 0.6 — all match ✓ |
| Burn summary | end-of-life 81.8%, pruning 81.6%, dead plant 79.3%, woody roots 72.2% ✓ |
| Land-use transitions | 906 total, matching the repeat count ✓ |
| NPK parser | correct on all 6 spot cases incl. the two negatives ✓ |
| PII | 0 rows / 0 columns ✓ |

New numbers the store now yields: **median yield 1.73 t/ha**, **median 15 kg N/ha**, **median shade cover 8%**, **net +164.7 ha forest** (reforestation exceeds deforestation), **12 native→perennial** land conversions.

### DQ flags loaded: 7,304 across 3,254 farms
| Code | Farms | Note |
|---|---|---|
| `yield_curve_template` | 2,778 (85.4%) | mature crop, year-0 = 0 |
| `lifecycle_truncated` | 2,396 (73.6%) | lifecycle > 31-year ceiling |
| `yes_but_empty` | 733 | reported a practice, entered no detail |
| `out_of_range` | 552 | incl. AI% > 100, lifecycle 2006/504/503 |
| `unit_suspect` | 346 | tonnes-per-acre, litres-as-kg |
| `calendar_in_offset` | 335 | calendar year typed into an offset field |
| `magnitude_outlier` | 94 | 6,000 t yield, 182 ha farm |
| `residue_split_not_100` | 70 | splits not summing to 100 |

---

## 9. Files

```
coolfarm/pipeline/
  masp4_migration_sprint23_coolfarm.sql        DDL (16 tables, indexes, RLS)
  masp4_migration_sprint23_coolfarm_views.sql  25 views
  transform.py                                 pure transform + DQ rules
  sync_supabase.py                             backfill + incremental sync
```

Both migrations are applied. To adopt the in-platform convention these copy to `masp4-platform/pipeline/` (SQL) and `masp4-platform/pipeline/coolfarm/` (ETL) — mirroring `pipeline/vsla/`, `pipeline/cva/`.

---

## 10. Open item for Phase 3

**Where should the dashboard live?** The brief asks for a standalone Next.js app + new repo + Vercel project. But the design reference (`/output-insights`) *is* `masp4-platform`, and all three sibling Kobo dashboards are pages inside it. A standalone app means a second Vercel project, a second set of Supabase env vars, and a second auth setup — for a dashboard whose data already lives in this platform's database behind this platform's role system.

Recommendation: **build it as a route inside `masp4-platform`**. Confirm before Phase 3 starts.
