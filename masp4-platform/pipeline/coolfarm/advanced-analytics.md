# Cool Farm Dashboard — Advanced Analytics & Modelling Layer (Phase 1B)

**Source form:** `a4AC6PCXs4QFs3KBym8KKS` · **Cohort:** 3,254 assessments, Uganda only
**Every figure below was fitted or computed against all 3,254 records**, not a sample.
Companion to [`analytics-inventory.md`](./analytics-inventory.md) (Phase 1) and
[`data-architecture.md`](./data-architecture.md) (Phase 2).

Each item states: **source fields → formula → dashboard section → tier → verdict.**
Tiers are independently approvable.

---

## 0. Scope boundary — what cannot be built from this data

**True CO₂e/GHG output requires Cool Farm Tool's emission factors, which are not in this form.** The form supplies *activity data* — litres of fuel, kg of fertiliser, % of residue burned, tonne-km transported — not the factors that convert them. `gwp` is a **single constant (`IPCC_AR6`) across all 3,254 rows**: a methodology label, not a per-crop factor.

Producing CO₂e would require, as separately scoped work: N₂O factors by fertiliser type (direct + indirect, IPCC tiers), CH₄/N₂O from residue burning, embedded manufacturing emissions by production region, combustion factors by fuel, soil-carbon flux by land-use transition and climate zone, and biomass sequestration curves for shade species.

Safe to build from this data alone: **Tier 1 ratios, Tier 5 data quality, Tier 6 geospatial**. Tier 3–4 are statistically legitimate but must be reported as descriptive, never predictive. Anything labelled GHG/CO₂e beyond the explicitly-caveated Tier 2 proxy needs the emission-factor layer approved separately.

### One correction to the brief's premise
The brief states Tier 1 is safe "no assumptions needed". It is safe **only after unit normalisation and label-parsed nitrogen**. Computed on raw fields these ratios are wrong by factors of 2.47 (acres↔ha), 1,000 (tonnes↔kg), or entirely absent (the dedicated N fields are populated in 11 of 2,099 rows). All of that is handled in `transform.py`; see `data-architecture.md` §3–4.

---

## 1. Tier 1 — Ratios & normalised indicators

**Verdict: ship in v1.** Implemented as `v_cfp_tier1_ratios` + surfaced in the dashboard's *Advanced Analytics* section. All are computed from normalised columns.

| Indicator | Source fields | Formula | Section | Coverage | Median |
|---|---|---|---|---|---|
| **Yield per hectare** | `total_yield_t`, `area_ha` | `total_yield_t / area_ha` | Production | 3,254 | **1.73 t/ha** |
| **Yield per plant** | `total_yield_t`, `plants_per_ha`, `area_ha` | `total_yield_t×1000 / (plants_per_ha × area_ha)` | Production | 3,254 | **1.48 kg/plant** |
| **Nitrogen-use efficiency** | `n_kg_per_ha`, `yield_t_per_ha` | `yield_t_per_ha / n_kg_per_ha` | Fertiliser | 1,558 | **0.146 t per kg N** |
| **Fertiliser rate /ha** | `fertiliser_application_rate`(+uom), `area_ha` | normalised `rate_kg_per_ha` | Fertiliser | 2,099 apps | 60 kg/ha |
| **Pesticide AI load /ha** | `application_rate`, `active_ingredient`, `perc_field_applied` | `rate_per_ha × AI% × field%` | Crop Protection | 930 | 0.0 kg/ha |
| **Energy intensity** | `energy_litres`, `area_ha`, yield | `energy_litres / area_ha` | Rare Inputs | **102** | 37.1 l/ha |
| **Irrigation dependency** | `irrigation_water_m3`, `area_ha` | `water_m3 / area_ha` | Rare Inputs | **13** | 3.1 m³/ha |
| **Residue circularity** | `cfp_residue_fates` | `Σ(left_on_soil, aerobic, anaerobic, heaps) / 100` per stream | **Residues** | 3,254 | see below |
| **Agroforestry integration** | `shade_trees.density_per_ha`, `plants_per_ha` | `shade_density / crop_density` | Agroforestry | 2,237 | 0.029 |
| **Mortality / replacement** | `dead_plants_perc`, `dead_plants_replaced` | rate + % replaced | Crop & Farm | 3,254 | 2.0% (71.9% replaced) |
| **Transport intensity** | `transport_weight`(+uom), `transport_distance_km` | `Σ(weight_kg/1000 × km)` | Transport | 3,254 | 0.62 t-km |
| **Demographic ratios** | `cooperative_membership`, mobile/internet, `literacy_level` | share of cohort | Farmer Profile | 3,254 | 85.7% / 87.6% / 19.0% |

### Residue circularity is the strongest new indicator
100% populated, and the split is agronomically interpretable — **leafy residue is retained, woody residue is burned**:

| Stream | Circular % | Farms with zero circularity |
|---|---|---|
| `life_cycle_end_leaves` | **93.9** | 163 |
| `leaf_litter` | **92.1** | 210 |
| `pulp_hask` | 78.7 | 508 |
| `fruit` | 61.2 | 506 |
| `seed` | 57.1 | 687 |
| `life_cycle_end_woody_roots` | 38.2 | 998 |
| `pruning` | **30.3** | 937 |
| `dead_plant` | **25.1** | 1,481 |
| `end_of_life_cycle` | **20.9** | 1,479 |

That is a directly actionable intervention target: the material farmers already retain is the material that decomposes easily anyway; the woody material with real biomass is burned.

### Two Tier 1 ratios carry the yield contamination
`yield_kg_per_plant` (p95 = 369 kg/plant) and `NUE` (p95 = 37 t/kg N) inherit the `yield_t_per_ha` problem — 322 rows exceed 5 t/ha, max 2,965. **Both are displayed on plausibility-bounded rows with medians only**, never means. See §5.

---

## 2. Tier 2 — Composite indices ⏸ AWAITING YOUR APPROVAL

**Not built.** Per the brief, weights are proposed here and nothing ships until you've seen them.

### 2a. Sustainable Practice Adoption Index (SPAI)

The brief specifies four components: composting uptake, wastewater treatment, shade cover, reduced burning. **Two of the four are dead:** wastewater treatment is documented for **1 farm**, fuel/energy for 102, and composting appears in only **12.8%** of residue records. Component correlations are all between −0.02 and +0.16, so weights alone would determine the index.

**Proposed — 2 components:**
```
SPAI = 0.60 × (100 − residue_burn_share)/100
     + 0.40 × min(shade_cover_perc, 50)/50
```
Rationale: burning is the largest, best-measured, most GHG-relevant practice in the dataset (100% coverage); shade cover is the sequestration counterweight (2,237 farms). **Shade is capped at 50%** because beyond that shade suppresses coffee yield — an uncapped term would reward poor agronomy as "sustainable".

Recommended over a 4-component version, which would dilute two live signals with two that are ~0% populated and produce a score that looks richer than the evidence.

### 2b. Nitrogen Balance Index (NBI)
```
NBI = n_kg_per_ha / yield_t_per_ha      → median ≈ 6.8 kg N per tonne
```
**"GWP-adjusted" as the brief requests is not possible** — `gwp` is one constant, so adjusting by it is multiplying every row by the same number. Proposed unadjusted, on plausibility-bounded yield rows.

### 2c. Practice-based GHG proxy — I recommend **not** shipping this as a single score
```
proxy = 0.50 × burn_share/100
      + 0.35 × min(n_kg_per_ha, 200)/200
      + 0.15 × min(energy_l_per_ha, 50)/50
```
It is computable, but **96.9% of farms have zero fuel and 52% zero nitrogen**, so the score is ≈85% burn share wearing a carbon label — and it *will* be quoted as CO₂e no matter how it's captioned. **Recommendation: show the three components separately**, which loses no information and makes no false claim. If you want the single score anyway, the formula above is what I'd use.

---

## 3. Tier 3 — Regression / statistical modelling

**Verdict: 3 of 5 viable, as v2.** Descriptive coefficient tables only, never prediction.

**Implementation:** a Python batch job in `pipeline/coolfarm/`, writing to `cfp_model_coefficients` / `cfp_model_fit` / `cfp_transition_probs`, on the **GitHub Actions** ETL schedule. Not Edge Functions (no numpy in Deno) and not in-browser. **Monthly refresh is ample** — the cohort has gained one submission since February 2025.

| Model | Verdict | Detail |
|---|---|---|
| **Yield-driver regression** | ✅ v2 | R² = **0.058** (n = 2,908). Significant: `crop_age` +0.016\*\*\*, `shade_cover` −0.008\*\*\*, `is_shaded` −0.220\*\*\*, cocoa −0.508\*\*\*, `plants_per_ha` +0.064\*\*, AI load +0.001\*. Ship as a coefficient table captioned **"explains 6% of variance"**. |
| **Fertiliser response curve** | ❌ **drop** | **There is no response to model.** `corr(n_kg_per_ha, yield_t_per_ha)` = **−0.012** over 1,558 farms (−0.016 on plausible rows) — r² ≈ 0.0002, and *negative*. Excluding `unit_suspect` rows does not help. The brief expects diminishing returns; the data shows no returns at all. Publishing a fitted curve would manufacture a relationship. |
| **Yield time-trend regression** | ❌ **drop** | The `yield_est_year_*` series are generic templates: 48% of farms share a curve with ≥10 others and 85% report a mature crop with year-0 = 0. A per-farm slope measures the template, not the farm. |
| **Practice-adoption logistic** | ✅ v2 — best value | pseudo-R² 0.007–0.033. Robust finding: **low literacy predicts lower adoption of all five practices**; larger farms buy inputs but adopt less agroforestry. Directly usable for extension targeting. ⚠ Co-op membership appears to *negatively* predict shade trees (−0.96); it holds within all three projects but non-members number only 10 and 8 in two of them, so it is Climate-Heroes-driven — **flag, don't conclude**. |
| **Land-use Markov transitions** | ✅ v2 | Viable by region except `western` (<30 transitions). Base matrix already shipped as `v_cfp_land_use_transitions`; this adds row-normalised probabilities. |

---

## 4. Tier 4 — Segmentation / clustering

**Verdict: viable, v2.**

- **Farmer typology:** k-means on 8 bounded, standardised features (area, yield/ha, N/ha, AI/ha, shade cover, burn share, plants/ha, crop age); k chosen by silhouette over 2–8. Use **`scipy.cluster.vq`** rather than adding scikit-learn — **sklearn is not installed** in this environment, and the dependency isn't worth it for k-means.
- **Co-operative-level clustering: ❌ blocked.** `cooperative_name_raw` is free text (2,790 entries) and needs normalisation before groups can be formed at all. Prerequisite, not a model.

---

## 5. Tier 5 — Anomaly & data quality

**Verdict: shipped in v1** (7,304 flags across 3,254 farms, `cfp_dq_flags` + the Data Quality section). Additions below.

| Item | Status |
|---|---|
| Outlier flags on continuous fields | ✅ shipped — but **z-scores are the wrong tool here**: skew runs 7–52. Use **IQR on logs**. |
| Entry-error vs agronomic anomaly labelling | ➕ **added**: physical-bound breaches (AI > 100%, lifecycle 504/2006 yrs) = entry error; in-bound tails = genuine outlier. Now carried as `likely_cause`. |
| **Enumerator effect (ANOVA)** | ✅ shipped and **the signal is severe** — see below. |
| Completeness per section/field | ✅ shipped |
| Duplicate-farmer detection | ⚠ **GPS-only is not viable**: only **2 rows** share exact coordinates while **54.5%** sit within ~110 m of another farm (village clustering). Requires name matching — and names are excluded from Supabase by policy, so this must run **inside the ETL**, emitting flags only. 74 rows share a first+other-name pair and 139 phone numbers repeat. |

### The enumerator effect is the most important caveat in this dashboard
Independently verified: across the **38 enumerators with 20+ assessments**, mean `residue_burn_share` ranges **2.3% → 77.5%**, standard deviation of means **18.6 points**. `shade_cover_perc` and `yield_t_per_ha` show the same pattern — but **`area_ha` does not** (F = 1.11, p = 0.30), and no enumerator can influence farm size.

Enumerators worked in distinct regions, so this is confounded with real geography. But a purely geographic story would move farm size too. The residual points to genuine differences in how the residue question was asked or interpreted. **Any target set from the 81.8% burn headline should be validated by an independent spot-check first.** This is surfaced in the dashboard, not buried here.

---

## 6. Tier 6 — Geospatial

**Verdict: shipped in v1**, with one item dropped.

| Item | Status |
|---|---|
| Choropleth by admin level | ✅ `v_cfp_district_geo` (27) + `v_cfp_region_geo` (7): burn share, shade cover, N/ha, median yield, adoption, deforestation counts — all metrics in one row so the map switches metric without refetching |
| Spatial distribution | ✅ ~2.2 km aggregated grid cells, cells with n<3 suppressed. **Not a projected basemap** — a true choropleth needs Uganda admin boundaries (absent), and a tile basemap would send farm coordinates to a third-party tile server |
| Spatial outlier detection | ✅ `v_cfp_geo_outliers` — haversine distance to the farm's own district centroid (PostGIS not installed). **8 farms >50 km out, worst 206 km** = probable district mis-selection |
| Deforestation hotspot clustering | ❌ **drop** — **65 GPS points across 12 districts is too thin to cluster**. Per-district counts (already in `v_cfp_district_geo`) are the honest presentation |

---

## 7. Summary — what ships when

| Tier | Verdict | Where |
|---|---|---|
| **1 — Ratios** | ✅ **v1, shipped** | `v_cfp_tier1_ratios` + *Advanced Analytics* section |
| **2 — Composite indices** | ⏸ **awaiting approval** — SPAI 2-component, NBI unadjusted, GHG proxy as separate components | — |
| **3 — Regression** | ✅ 3 of 5 as **v2**; response curve + time trend **dropped** | Python batch → `cfp_model_*`, GH Actions, monthly |
| **4 — Clustering** | ✅ **v2** typology (scipy); co-op clustering blocked on name normalisation | as above |
| **5 — Data quality** | ✅ **v1, shipped**; dedup needs ETL-side name matching | `cfp_dq_flags` + Data Quality section |
| **6 — Geospatial** | ✅ **v1, shipped**; hotspot clustering dropped | `v_cfp_*_geo` + Geography section |

### Decisions I need from you
1. **SPAI** — 2-component as proposed, or 4-component including the ~0%-populated terms?
2. **NBI** — unadjusted (the only option, since `gwp` is constant)?
3. **GHG proxy** — separate components *(recommended)* or the single weighted score?
4. **Confirm the three drops** — fertiliser response curve, yield time-trend, GPS-only dedup, deforestation hotspot clustering.
5. **Tier 3–4 as v2 on a monthly GitHub Actions batch** — confirm scope and cadence.
