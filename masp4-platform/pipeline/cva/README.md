# Climate Vulnerability Assessment (CVA) Dashboard Pipeline

Analytics for the **ECA CAI Measurement Tool** Kobo form (asset
`aGSsfgrUoJzgLM4aLfPXoj`), embedded in `/output-insights`. One self-contained
dashboard covering **Kenya + Uganda** household climate-vulnerability data.

| Item | Value |
|---|---|
| Kobo form | `aGSsfgrUoJzgLM4aLfPXoj` — *ECA CAI Measurement Tool* |
| Dashboard | `public/Climate_Vulnerability_Dashboard.html` |
| Supabase | `cva_*` tables + `v_cva_*` views (Sprint 19) |
| Refresh | nightly via `.github/workflows/cva.yml` (03:40 UTC) |

## Flow

```
fetch_cva_json.py   Kobo JSON API -> data/cva_raw.json + data/cva_formdef.json
        │
transform.py        version-robust decode + normalize + composite scores + dq_flags
        │             -> data/clean_{households,hazard_exposure,impacts,
        │                            capacity_ind,capacity_sources,adaptation}.json
        ├── load_supabase.py   idempotent upsert -> cva_* tables + stamp cva_sync_meta
        │                      (migration: pipeline/masp4_migration_sprint19_climate_vulnerability.sql)
        └── build_dashboard.py rebuild public/Climate_Vulnerability_Dashboard.html
                               (compact index-encoded dataset baked in; Chart.js + Leaflet)
```

`transform.py` is the single source of cleaning logic, shared by the loader and the
dashboard builder, so Supabase and the dashboard can never diverge.

## Dashboard tabs

1. **Coverage** — households by country/admin-1/project, gender, age & household-size
   distributions, main-crop mix, data-completeness checks.
2. **Hazard exposure** — prevalence of all 10 hazards, severity/frequency mixes, a
   composite exposure score, an admin-1 Leaflet choropleth + GPS point layer, and a
   hazard co-occurrence heatmap. Bars drill to the underlying households.
3. **Impacts** — most common production / harvest-storage / marketing / social impacts,
   plus a hazard × impact-category co-reporting heatmap.
4. **Sensitivity & adaptive capacity** — % positive per capacity indicator, education,
   extension/financial/weather/knowledge/re-investment sources, and the composite
   adaptive-capacity score distribution.
5. **Adaptation uptake** — adoption rate per domain and per specific practice, domains
   adopted per household, and adoption cut by exposure and capacity quartiles.
6. **Vulnerability matrix** — exposure vs capacity scatter; the high-exposure/low-capacity
   quadrant is the priority targeting shortlist (filterable table, click-through).
7. **Impacts deep-dive** — full per-choice frequency of every production / harvest-storage /
   marketing / social impact, cross-tabbed against hazard, severity, region, crop and gender.
8. **Vulnerability index** — weighted Adaptive Capacity Index (5 sub-dimensions 20/20/25/20/15),
   Hazard Exposure Index (= the exposure score), composite VI = 0.5·HEI + 0.5·(100−ACI), and the
   fixed-threshold Critical / Stressed / Latent-risk / Stable quadrants.
9. **Geospatial & elevation** — altitude-derived analytics: elevation-banded HEI/ACI/VI + quadrant
   mix, an agro-ecological-zone benchmark, altitude↔capacity Pearson correlations, crop-altitude
   suitability mismatch, a spatial VI point map (Leaflet, coloured by quadrant/VI/hotspot, sized by
   elevation), and DBSCAN hotspots + a global Moran's I of the Vulnerability Index.

The index (7–9) and geospatial logic live in `transform.py` (`compute_indices`, `crop_alt_mismatch`,
`spatial_clusters`, `morans_i`). The composite indices (ACI/VI/quadrant) and the spatial hotspot/
Moran's I pass are applied **at build time only** — never written to the household dict, so those never
touch the schema. **Altitude**, however, *is* persisted: `geo_split` parses the 3rd token of the raw
`gps_location` string into `cva_households.altitude` (Sprint 20), with a generated `elevation_band`
column for band-level queries (no re-fetch — altitude was already in the stored raw JSON).
`build_dashboard.py` also writes `data/cva_farmer_indices.csv` (one row per farmer, incl. lat/lon/
altitude/elevation-band/HEI/ACI/5 sub-dims/VI/quadrant/crop-alt-mismatch/hotspot/cluster-id).

**Global filters** (country, admin-1, project, gender, crop, month range) apply across
every tab.

## Composite scores (methodology)

- **hazard_exposure_score** = `100 * Σ(severity_wt × frequency_wt) / 90`, where severity
  High/Med/Low = 3/2/1 and frequency (>4× / 2–3× / 1–2× per year) = 3/2/1. 90 = 10 hazards
  × the 3×3 maximum. Experienced-but-unrated hazards contribute a floor of 1.
- **adaptive_capacity_score** = `100 × (# positive capacity indicators) / (# answered)`
  over 15 indicators.
- **priority_flag** = exposure ≥ country median **AND** capacity ≤ country median.

## Defensive DQ handling (baked into `transform.py`)

The form evolved across versions (2023→2026); cleaning is done in the pipeline, not at source:

- **version-robust field access** — `main_crop`→`farmer_main_crop`, `frost_level`, and
  ungrouped `excess_rainfall_*` are all matched by group-suffix.
- **choice decode** built dynamically from the *current* form definition; retired legacy
  codes fall back to a humanized label and are flagged `legacy_impact_code`.
- **country recovery** — legacy rows predate `admin_level_0`; country is recovered from GPS
  point-in-bounding-box (`country_from_gps`).
- **GPS validation** (`gps_missing` / `geo_out_of_bounds`), **age** range check,
  **household-size** outlier flag, **duplicate farmer_id** flag, **field_size** normalized
  to hectares. All issues surfaced in `dq_flags`, never dropped.

## Run locally

```bash
cd masp4-platform
pip install -r pipeline/cva/requirements.txt
export KOBO_TOKEN=...                        # KoBoToolbox API token
python pipeline/cva/fetch_cva_json.py
python pipeline/cva/transform.py
python pipeline/cva/load_supabase.py         # reads .env.local for Supabase keys
python pipeline/cva/build_dashboard.py
```

## Supabase objects (Sprint 19)

Tables `cva_raw_submissions`, `cva_households`, `cva_hazard_exposure`, `cva_impacts`,
`cva_capacity_indicators`, `cva_capacity_sources`, `cva_adaptation_practices`,
`cva_sync_meta`; views `v_cva_coverage`, `v_cva_hazard_prevalence`, `v_cva_impacts`,
`v_cva_capacity`, `v_cva_adaptation_uptake`, `v_cva_vulnerability_matrix`. All additive,
namespaced, RLS read-all / authed-writes. Apply
`pipeline/masp4_migration_sprint19_climate_vulnerability.sql` (idempotent).

**Sprint 20** (`pipeline/masp4_migration_sprint20_cva_altitude.sql`, idempotent) adds
`cva_households.altitude` (numeric, m) + a generated `elevation_band` column. Re-run
`load_supabase.py` after applying to populate altitude.

## Map boundaries

`geo/cva_admin1.geojson` — simplified KE county + UG region polygons (from geoBoundaries
gbOpen ADM1), filtered to the units present in the data and committed as an asset. UG
"South Western" is mapped onto the Western region polygon.

## Deploy note

The live platform deploys from the **private org repo** `solidaridad-eca/masp4-platform`;
pushes to `main` there trigger Vercel. If auto-deploy is not wired, deploy manually with
`npx vercel --prod --yes` from the repo root after the dashboard is rebuilt.
