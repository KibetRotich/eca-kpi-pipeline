# Cool Farm Dashboard — Analytics Inventory (Phase 1)

**Source form:** `a4AC6PCXs4QFs3KBym8KKS` — "ECA CFP Crops Assessments v25.04.25"
**Form created:** 2024-10-14 · **Submissions:** 3,254 · **Collection window:** 2024-10-19 → 2025-09-10
**Profiled:** 2026-07-28, against a full local extract of all 3,254 submissions (not a sample)

Structure confirmed: **15 top-level groups, 10 repeat groups, 192 parent-level data keys.**
Method notes are in [`docs/phase1-method.md`](./phase1-method.md).

---

## 0. Executive summary — read this first

Five findings materially change the dashboard scope proposed in the brief:

| # | Finding | Consequence |
|---|---|---|
| **1** | **There is no Kenya data.** All 3,254 submissions are `uganda`. The choice list offers Kenya, but it has never been used. | Country ceases to be a filter dimension; it becomes a single-value context label. Region (7) / district (27) are the real geographic filters. |
| **2** | **Wastewater, irrigation and fuel/energy are effectively unpopulated** — 1, 13 and 102 submissions with data respectively (0.03%, 0.4%, 3.1% of submissions with data). | Three of the brief's proposed sections cannot stand alone. Merge into one "Rare Inputs" panel. |
| **3** | **The `yield_est_year_0…30` columns are not yields.** They are a *% of peak-yield lifecycle curve* (label: `${year_N_label} %`). Actual production is the single field `total_yield_assessment_year` (tonnes). | The "yield trend" chart in the brief would be wrong. And the curves are largely template copy-paste (see §17) — recommend **not** shipping it as a farm-performance trend. |
| **4** | **Fertiliser N-composition fields are filled in 11 of 2,099 rows** (0.5%) — they only unlock when `fertilizer_category = compose_own`. | The brief's "priority N-composition tile" is not viable as designed. **But** N% is parseable from the `fertiliser_type` label itself (`"Cattle manure - 0.6% N"`) for 1,655 rows — that is the route to the N tile. |
| **5** | **Residue management is the strongest, cleanest section** — 100% populated, sums to 100% in 99.8% of rows, and shows **81.8% of farms burning end-of-life residue**. | This should be the dashboard's headline story, not a mid-page panel. |

**Assessment years present:** 2023 (3,010) and 2024 (244) only. There is **no multi-year trend axis**. Any "over time" tile must use `_submission_time` (fieldwork progress) or the lifecycle curve — not assessment year.

---

## 1. Diff: live schema vs. the brief's primer

The primer was accurate on group/repeat structure. Corrections:

| Primer said | Actually | Impact |
|---|---|---|
| `country` field | `admin_level_0` | naming only |
| `farmer name` | `farmer_first_name` + `farmer_other_names` | 2 fields; both PII |
| admin levels 1–3 as filters | `admin_level_1` = select_one (7 regions), `admin_level_2` = **select_one_from_file** (27 districts), `admin_level_3` = **free text** | level 3 unusable as a clean filter |
| — | **`total_yield_assessment_year`** (decimal, tonnes) — not in primer | the only real production metric |
| — | **`waste_fuit_perc`** (sic), `pruning_constant_pruning_val`, `pruning_constant_pruning_start_year` | extra fields |
| 5 residue types | **9 residue streams** × 3–6 fates each (43 fields) | richer than described |
| `energy_use_category` select_one | **select_multiple** (space-delimited in data) | needs split on load |
| `crop_residues_pruning` wide years need reshaping | **`pruning_option` = `constant_value` for all 3,254 rows**; only 29 rows have any `pruning_est_year_*` value (legacy versions) | **no reshape needed** — dead columns |
| `gwp` = GWP factor per crop | single value `IPCC_AR6` for all rows | not analytically useful |
| `forest_type` a dimension | single value `tropical moist deciduous forest` | not a dimension |
| — | `intercrop_exist` / `shade_trees_exist` / `hedges_exist` / `land_use_change_exist` / `*_applied_exist` gate flags | drive adoption-% tiles directly |

**Also found:** 7 form versions in use, and a stray artefact field `crop_details/calculation` (1 row).

---

## 2. Field inventory

Legend for **Tile**: `#`=number/KPI · `bar` · `col`=stacked column · `line` · `donut` · `map` · `tbl`=table · `sankey`/`matrix` · `hist`=distribution · `flag`=data-quality only.
**Cov** = rows with a value, out of 3,254 (or out of repeat instances where noted).

### §1 `general_information` — 25 fields

| Field | Label | Type | Cov | Possible analytics | Tile |
|---|---|---|---|---|---|
| `admin_level_0` | Country | select_one | 3254 | **Single value (`uganda`)** — context label only | # |
| `admin_level_1` | Region | select_one | 3254 | Primary geo filter; 7 regions (central 815 … northern_acholi 101). Cross-tab vs every practice | bar / filter |
| `admin_level_2` | District | select_one_from_file | 3254 | Secondary geo filter; 27 districts (Sheema 498 … ) | bar / filter |
| `admin_level_3` | County & sub-county | text | 3254 | **Free text — dirty.** Do not filter on it; DQ tile only | flag |
| `admin_level_1_title` / `_2_title` / `_3_title` | admin nomenclature | calculate | 3254 | Single values (`region`/`district`/`county & sub-country`). Use to **label the filter UI** dynamically if Kenya is added | — |
| `village` | Village | text | 3254 | Free text, high cardinality. Completeness only | flag |
| `registration_gps` | GPS | geopoint | 3254 | **100% valid, all inside the East Africa bbox** — zero bad points. Point map + region choropleth + density | **map** |
| `project` | Project | select_one | 3254 | Climate Heroes 2448 / Harvesting Carbon 562 / FVO ICAM Cocoa 244. **Primary filter.** Cross-tab vs everything | donut / filter |
| `farmer_first_name`, `farmer_other_names` | Names | text | 3254 | **PII — exclude from the analytics store.** Dup-name check only (74 rows share a name pair) | flag |
| `phone_number` | Phone | text | 3036 | **PII — exclude.** 139 duplicate numbers = possible double-enrolment | flag |
| `birth_year` | Birth year | integer | 3254 | Derive **age** (median 51). Age-band bars; youth (<35) share; cross-tab vs gender/practice | hist / # |
| `gender` | Gender | select_one | 3254 | male 2155 / female 1099 → **33.8% female**. Cross-tab vs every practice — key equity lens | donut / # |
| `literacy_level` | Literacy | select_one | 3254 | 10 levels; **72.0% primary-or-less** (2,343/3,254 = no formal education + primary incomplete + primary complete). Bar; cross-tab vs practice adoption | bar |
| `access_to_mobile_device` | Mobile access | select_one | 3254 | 87.6% yes | # |
| `mobile_device_type` | Device type | select_one | 2851 | feature phone 2439 / smartphone 343 / tablet 69 — **digital-readiness indicator** | donut |
| `access_to_internet_3_mnths` | Internet 3mo | select_one | 2851 | 19.0% of device-owners. Digital inclusion | # |
| `language` | Language | select_one | 3254 | local 3224 / english 29 / swahili 1 — near-constant | — |
| `disability` | Disability | select_one | 3254 | 3.7% yes — inclusion KPI | # |
| `disability_form` | Disability type | select_one | 121 | physical 61 / visual 40 / … Small n — table, not chart | tbl |
| `household_size` | Household size | integer | 3254 | median 6, max 20. Derive **people reached** (21,651) | # / hist |
| `cooperative_membership` | Co-op member | select_one | 3254 | **85.7% yes** — organisational reach KPI | # |
| `cooperative_name` | Co-op name | text | 2790 | Free text, needs cleaning. Top-co-ops table (post-normalisation) | tbl |

### §2 `crop_details` — 12 fields (+31 year labels)

| Field | Label | Type | Cov | Possible analytics | Tile |
|---|---|---|---|---|---|
| `crop_type` | Crop type | select_one | 3254 | coffee shaded 2743 / coffee monocrop 266 / cocoa shaded 172 / cocoa monocrop 72 **+ 1 dirty `cocoa_monocrop`**. → **89.6% shaded** — agroforestry headline. Cross-tab vs everything | donut / # |
| `soil_type` | Soil type | select_one | 3254 | medium 2617 / coarse 583 / fine 54 | bar |
| `expected_lifecycle_years` | Lifecycle (yrs) | integer | 3254 | median 50. **Dirty tail: 2006, 504, 503, 100, 1, 2** | hist + flag |
| `assessment_year` | Assessment year | integer | 3254 | **2023 (3010) / 2024 (244) only — not a usable trend axis** | # |
| `crop_age` | Crop age | integer | 3254 | median 12, max 65. Age-band bars; cross-tab vs yield | hist |
| `growing_area` + `_uom` | Growing area | decimal + select_one | 3254 | **acres 3003 / hectares 251 — MUST normalise.** Normalised: **2,549 ha total**, median 0.40 ha, p95 1.62 ha, max 182 ha (1 farm >20 ha, 27 <0.1 ha) | # / hist |
| `dead_plants_perc` | Dead plants % | decimal | 3254 | median 2%, mean 8.2%, max 100% — orchard-health / replanting-need indicator | # / hist |
| `dead_plants_replaced` | Replaced? | select_one | 3254 | 71.9% yes | # |
| `gwp` | GWP | select_one | 3254 | **Single value `IPCC_AR6`** — drop | — |
| `no_plants_per_area` + `_uom` | Plant density | integer + select_one | 3254 | median 450/acre (acres 3250 / ha 4 — normalise). Cross-tab vs crop type & yield | hist |
| `year_0_label` … `year_30_label` | year→calendar map | calculate | 3082–3254 | Not analytics; **the offset→calendar-year key for reshaping** (`year_0` = assessment year) | — |

### §3 `crop_yield` — 32 fields

| Field | Label | Type | Cov | Possible analytics | Tile |
|---|---|---|---|---|---|
| `total_yield_assessment_year` | Total yield (t) | decimal | 3254 | **The only real production figure.** median 1.0 t, mean 25.8 t, **max 6,000 t (outlier)**. Derive **yield intensity t/ha** — the key productivity metric. Cross-tab vs crop type, region, fertiliser use | # / hist / bar |
| `yield_est_year_0…30` | `${year_N_label} %` | integer ×31 | 3254→3082 | **⚠ RESHAPE-TO-LONG required.** These are **% of peak yield**, not tonnes. median y0=0, y5=83, y15=75, y30=60. See §17 for why this should **not** ship as a farm trend chart | line (⚠ see §17) |

### §4 `crop_residues` — 43 fields ⭐ strongest section

9 streams × fates, each row a % split. **All 3,254 rows populated; 99.8% sum to exactly 100%.**

| Stream | Fates available | Mean % split | Burning |
|---|---|---|---|
| `pruning` | burn, heaps_pits, aerobic_compost, anaerobic_compost, left_on_soil, export | burn **61.2** · left_on_soil 27.7 · export 8.5 · heaps 1.1 · aer 0.9 · anaer 0.6 | **81.6% of farms burn some; 732 burn 100%** |
| `leaf_litter` | burn, heaps, aer, anaer, left_on_soil | left_on_soil **87.3** · burn 7.8 · aer 2.0 · heaps 1.4 · anaer 1.3 | 12.4% burn any |
| `fruit` | heaps, aer, anaer, left_on_soil, export | left_on_soil 52.1 · export 38.6 · heaps 7.8 | no burn option |
| `dead_plant` | burn, left_on_soil, export | burn **65.4** · left_on_soil 25.1 · export 9.5 | **79.3% burn; 1,219 burn 100%** |
| `end_of_life_cycle` | burn, left_on_soil, export | burn **69.0** · left_on_soil 20.9 · export 10.0 | **81.8% burn; 1,178 burn 100%** |
| `life_cycle_end_woody_roots` | burn, left_on_soil, export | burn **52.3** · left_on_soil 38.2 · export 9.4 | 72.2% burn |
| `life_cycle_end_leaves` | burn, heaps, aer, anaer, left_on_soil | left_on_soil 88.1 · burn 6.0 · heaps 2.8 · aer 2.1 | 12.4% burn |
| `pulp_hask` | heaps, aer, anaer, left_on_soil, export | left_on_soil 62.8 · export 21.2 · heaps 11.2 | no burn option |
| `seed` | heaps, aer, anaer, left_on_soil, export | left_on_soil 51.4 · export 42.7 · heaps 4.9 | no burn option |

Analytics: **stacked 100% column per stream** (the flagship chart); a **burn-rate KPI**; burn-rate **choropleth by district**; cross-tab **burn % × crop type / region / project**; composting-adoption % (very low — a clear intervention target). `waste_fuit_perc` (median 2%, max 60%) → post-harvest loss KPI.
**DQ:** 8 rows sum to 0, 34 sum to something other than 100 → `flag`.

### §5 `crop_residues_pruning` — 36 fields ⚠ mostly dead

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `pruning_option` | select_one | 3254 | **`constant_value` for 100% of rows** → the year-by-year branch is never used | — |
| `pruning_weight_uom` | select_one | 3254 | `kgs` | — |
| `pruning_constant_pruning_val` | integer | 3254 | median 8 (%). **Dirty: max 2025** (calendar year typed in) | hist + flag |
| `pruning_constant_pruning_start_year` | integer | 3254 | median 3 (offset) but **p95 = 2031, max 2053, mean 194** → widespread offset-vs-calendar confusion | **flag** |
| `pruning_est_year_0…30` | integer ×31 | **29 rows, 2 columns** | **Dead columns** (legacy versions). ⚠ Primer called for reshaping these — **not needed** | — |

### §6 `waste_water` + `waste_water_treatments` (repeat) ⚠ not viable

Flag `waste_water_treatment_exist`: yes **12** / no 3,242. Repeat rows: **1 instance total.**
Fields (`oxygen_demand_type`, `treatment_process`, `waste_water_volume`+uom, `oxygen_demand`+uom) each have **n=1**.
→ **Not chartable.** Report as a single "12 farms reported wastewater treatment; 1 documented" line + the 11-row DQ gap.

### §7 `pesticide` + `pesticide_application` (repeat) — 1,062 instances / 930 farms

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `pesticide_applied_exist` | select_one | 3254 | **29.6% adoption** (964 yes) | # |
| `pesticide_category` | select_one | 1062 | post-emergence 977 / other 47 / soil treatment 38 | donut |
| `pesticide_type` | select_one | 1062 | herbicide 368 / pesticide 279 / fungicide 270 / insecticide 145 | bar |
| `perc_field_applied` | integer | 1062 | 63.8% of applications cover 100% of the field | hist |
| `active_ingredient` | integer | 1062 | median 35%, **max 180% → impossible, DQ flag** | hist + flag |
| `application_rate` + `_uom` | decimal + select_one | 1062 | median 2, max 2,150. **5 units mixed** (l/acre 572, l/ha 460, kg/acre 22, kg/ha 5, t/acre 3) — normalise before charting | hist |

Derived: **active-ingredient load per ha** = rate × AI% × field% (unit-normalised) — the meaningful crop-protection intensity metric.

### §8 `fertilizer_into` + `fertilizer_application` (repeat) — 2,099 instances / 1,569 farms

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `fertilizer_applied_exist` | select_one | 3254 | **50.3% adoption** (1,636 yes) — near-even split, good cross-tab dimension | # |
| `fertilizer_category` | select_one | 2099 | standard 2,088 / compose_own 11 | — |
| `fertiliser_type` | select_one | 2088 | **25 of 42 options used.** Organic-dominant: Cattle manure 557, NPK 15-15-15 413, Rock phosphate 219, K-sulphate 213, NPK nitrophosphate 205, Poultry manure 203 … → **organic vs synthetic split** is the key derived breakdown | bar / donut |
| `fertiliser_prod_region` | select_one | 2088 | Africa 2013 2,026 / Europe 45 / Default 9 / China 8 — matters for embedded-emissions factors | — |
| `fertiliser_n_ammonium`, `_n_nitrate`, `_n_urea`, `_p205`, `_n_k20`, `_n_other` | integer ×6 | **11 (0.5%)** | ⚠ **Brief's "priority N tile" is not viable from these fields.** Only populated for `compose_own` | flag |
| `fertiliser_application_rate` + `_uom` | decimal + select_one | 2099 | median 60, **max 40,000**. **6 units mixed** (kg/ha 928, kg/acre 720, **t/acre 239**, t/ha 105, l/acre 66, l/ha 41). t/acre at median 60 is physically implausible → unit-confusion DQ flag | hist + flag |

**→ Recommended N route:** parse the N/P/K percentages out of the `fertiliser_type` label (`"Cattle manure - 0.6% N"`, `"Compound NPK - 15% N / 15% K2O / 15% P2O5"`). **N% is parseable for 1,655 of 2,099 instances (78.8%)** vs 11 from the explicit fields. Combined with the unit-normalised rate this yields **kg N/ha applied** — a genuine N2O proxy and the strongest available GHG-driver metric.

### §9 `fuel_energy_into` + `fuel_energy_use` (repeat) ⚠ thin — 113 instances / 102 farms (3.1% documented, 4.3% reported)

`fuel_energy_applied_exist`: 140 yes. `energy_measurement_method`: `volume` (100%). `energy_source`: **4 of 29 options** — petrol biofuel-blend 103, diesel biofuel-blend 6, petrol mineral 2, diesel mineral 2. `energy_uom`: `litres` (100%). `energy_amount`: median ~15 l, max 1,201. `energy_use_category` (**select_multiple**): field 89, facility_processing 10, both 14.
→ One small panel at most: adoption %, litres by source, use-category split. **Not the "energy mix" section the brief envisaged.**

### §10 `irrigation_energy_into` + `irrigation_energy_use` (repeat) ⚠ not viable — 13 instances (0.4% documented, 0.6% reported)

`irrigation_energy_applied_exist`: 19 yes. Methods: drip 8, rain-gun/sprinkler 3, flooding 2. Water source: borehole 6, river 4, … Power: gravity 5, petrol 4, diesel 3, electric 1. `perc_field_irrigated`: 100% for 6. Water added: median 500 l (11 litres / 2 m³).
→ **Table of 13 rows + an adoption KPI.** Statistically meaningless as charts. Headline in its own right: **99.4% of assessed farms report no irrigation.**

### §11 `transport_into` + `transport_use` (repeat) — 3,578 instances / **all 3,254 farms** ✅

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `transport_type` | select_one | 3578 | **motorbike 3,157 (88.2%)**, road LGV diesel 130, car diesel 81, car petrol 79, road HGV 78, LGV petrol 28, LGV CNG/LPG 25 | bar / donut |
| `transport_boundary` | select_one | 3578 | Dispatched from farm 2,025 / Incoming 1,107 / Within-farm 446 | col |
| `transport_weight` + `_uom` | integer + select_one | 3578 | median 100, max 40,000. **kgs 2,996 / tonnes 582 — normalise** | hist |
| `transport_distance_km` | integer | 3578 | median 3 km, p95 25 km, max 450 km | hist |

Derived: **tonne-km** (normalised weight × distance) per farm/mode — the transport-emissions proxy. 100% coverage makes this a reliable section.

### §12 `non_crps_est` + `intercrop` / `shade_tress` / `hedge` (repeats) ✅

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `intercrop_exist` / `shade_trees_exist` / `hedges_exist` | select_one ×3 | 3254 | **71.4% / 78.6% / 14.8% adoption** | # ×3 |
| `intercrop_type` | select_one | 2835 | avocado 1,754 / jackfruit 1,036 / cashew 26 / durian 19 | bar |
| `intercrop_perc` | integer | 2835 | median 2% of farm, max 100% | hist |
| `intercrop_planting_density` + `_uom` | integer + select_one | 2835 | median 6/acre (acres 2,811 / ha 24 — normalise) | hist |
| `shade_tress_type` | select_one | 2343 | **9 distinct values from a 6-option list** — `Torpical` typo variants (383+29+1 = **413 instances**) must be merged into `Tropical`. Post-merge: tropical-wet-canopy 1,985, tropical-dry 166, temperate broadleaf 95, temperate shrubs 80, understory 11, conifers 7 | bar (after cleaning) |
| `shade_tress_perc` | integer | 2343 | **median 7% shade cover**, p95 34%, max 100% — the agroforestry-intensity metric | # / hist |
| `shade_tress_planting_density` + `_uom` | integer + select_one | 2343 | median 10/acre, max 900 | hist |
| `hedge_type` | select_one | 416 | species mix 409 / ash 5 / maple 1 / poplar 1 | tbl |
| `hedge_width` / `hedge_lenght` (sic) | integer ×2 | 416 | width median 40 m (**implausible for a hedge — likely mis-keyed**), length median 100 m, max 1,200 m. Derive hedge area | hist + flag |

Cross-cut with `crop_type` shaded-vs-monocrop (89.6% shaded) for the **carbon-sequestration practice** panel.

### §13 `re_deforestation` — 6 fields

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `forest_change` | select_one | 3254 | None 2,933 / **Reforestation 256 / Deforestation 65** — high-sensitivity indicator | donut / # |
| `forest_type` | select_one | 321 | single value — drop as a dimension | — |
| `de_forest_removed_age` | integer | 65 | median 18 yrs, max 93 — only for deforestation cases | hist |
| `de_final_year_pruning_perc` | integer | 321 | median 9%, **max 2049 → calendar-year contamination, DQ flag** | flag |
| `de_area_re_deforested` + `_uom` | integer + select_one | 321 | median 1, max 25 (normalise) → **net area reforested vs deforested** — a strong KPI | # / bar |

### §14 `soil_carbon_into` + `soil_carbon_change` (repeat) — 906 instances / 901 farms

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `land_use_change_exist` | select_one | 3254 | **28.5% yes** (927) | # |
| `land_use_change_previous` | select_one | 906 | cultivated 757 / set-aside 112 / perennial 25 / native 12 | — |
| `land_use_change_new` | select_one | 906 | perennial 672 / cultivated 203 / set-aside 30 / native 1 | — |
| **previous → new** | pair | 906 | **Transition matrix** — dominant flow cultivated→perennial (soil-carbon *gain*); 12 native→* conversions are the sensitive cases | **sankey / matrix** |
| `land_use_change_perc` | integer | 906 | median 70% of field | hist |
| `land_use_change_year` | integer | 906 | median 2013, p95 2021, **min 3 → offset/calendar contamination, DQ flag** | line + flag |

### §15 `conclusion` — 3 fields

| Field | Type | Cov | Analytics | Tile |
|---|---|---|---|---|
| `enumerator_name` | text | 3254 | **66 enumerators** (79 raw strings → whitespace/case variants need normalising). Top: Benard Onyango 262, Tamale Moses 177, Dennis Kabagambe 138. 18 with a single submission | bar / tbl |
| `farmer_questions` | text | — | Free text. **No NLP** (out of scope per brief) — completeness count only | flag |
| `enumerators_comment` | text | — | Free text — same | flag |

### Kobo metadata (available, useful)

`_id`, `_uuid` (3,254 unique — safe sync keys) · `_submission_time` (fieldwork timeline: Oct 2024 1,351 · Nov 2024 1,517 · Dec 92 · Feb 2025 48 · May 245 · Sep 1) · `_submitted_by` (single account `eca_datacollection2`) · `__version__` (**7 versions** — explains the shade-tree typo variants) · `_geolocation` (parsed lat/lon).

---

## 3. Fields requiring reshape-to-long

| Block | Columns | Reality | Verdict |
|---|---|---|---|
| `crop_yield__yield_est_year_0…30` | 31 | Populated (3,254→3,082); **% of peak yield**, not tonnes. `year_N_label` gives the calendar year | **Reshape** → `yield_curve(submission_id, year_offset, calendar_year, pct_of_peak)`. Ship as a *lifecycle-curve* visual only, with the §17 caveat |
| `crop_residues_pruning__pruning_est_year_0…30` | 31 | **Dead** — `pruning_option`=`constant_value` for 100% of rows; only 29 legacy rows, 2 columns | **Do not reshape.** Keep `pruning_constant_pruning_val` + `_start_year` as scalars |
| `crop_details__year_0…30_label` | 31 | Calculate fields = offset→calendar map | Fold into the reshaped yield table; don't store 31 columns |

Net: **one** reshape, not two as the brief assumed. This collapses 93 wide columns into ~3 stored columns.

---

## 4. ⚠ OPEN DECISION — compute CO2e, or stay at practice level?

**Confirmed: the form contains no emissions output.** No CO2e, no per-source emission fields. `gwp` is a single constant (`IPCC_AR6`) — a *methodology label*, not a factor.

To produce CO2e we would have to implement Cool Farm Tool emission-factor logic ourselves: N2O from N inputs (direct + indirect, IPCC tiers), CH4/N2O from residue burning, embedded fertiliser-manufacture emissions by production region, fuel/electricity combustion factors, transport factors by mode, soil-carbon-change flux by transition and climate zone, and biomass sequestration for shade trees. That is a **methodology project, not a dashboard feature** — and the data quality below would make the outputs fragile.

### My recommendation: **practice-adoption / raw-metric level for v1** — with a *derived-intensity* middle tier

Reasoning:
1. **The inputs for a defensible CO2e number are missing or too thin.** Energy 4.3% reported / 3.1% documented, irrigation 0.6% / 0.4%, wastewater 0.4% / 0.03%, explicit fertiliser N 0.5%. A footprint built on this would be dominated by unmeasured categories and would understate systematically.
2. **Unit chaos would propagate into the headline number.** Six fertiliser-rate units incl. 239 implausible t/acre rows; five pesticide units; area in acres *and* hectares. Every one is normalisable, but the residual error lands straight in a CO2e figure that people would quote.
3. **A wrong CO2e number is worse than none** in a carbon-programme context — it invites external challenge and is hard to retract.
4. **The practice-level story is already strong and defensible**: 81.8% of farms burn end-of-life residue, 89.6% grow shaded, 78.6% keep shade trees, 28.5% report land-use change dominated by cultivated→perennial. That is a complete, honest narrative from 100%-populated fields.

**Middle tier I do recommend building** (physically meaningful, no emission factors, no methodology risk):
- **kg N/ha applied** — from `fertiliser_type` label parsing (78.8% coverage) × normalised rate
- **tonne-km transported** — normalised weight × distance (100% coverage)
- **Yield intensity t/ha** — `total_yield_assessment_year` ÷ normalised area
- **Residue burned share** — already a clean % (100% coverage)
- **Shade-cover %** and **net area reforested**

These are the exact quantities a Cool Farm calculation would consume, so they become the input layer if you later greenlight CO2e — no rework.

**⏸ Confirm before Phase 2:** (a) practice-level + derived intensities as above *(my recommendation)*, (b) add a flagged-experimental CO2e module for fertiliser-N and residue-burning only — the two categories with adequate data, or (c) full Cool Farm implementation as a separate scoped workstream.

---

## 5. Proposed dashboard layout

Tiled, filter-driven, mirroring the `output-insights` pattern. **Global filters:** project (3) · region (7) · district (27) · crop type (4) · gender · submission-date range. *(Country dropped — single-valued. Assessment year dropped — only 2 values.)*

| # | Section | Tiles |
|---|---|---|
| **A** | **Overview KPI strip** | Farmers assessed **3,254** · Area **2,549 ha** · People reached **21,651** · Districts **27** · Projects **3** · Female **33.8%** · Co-op members **85.7%** · Shaded systems **89.6%** |
| **B** | **⭐ Residue Management & Burning** *(lead section — the story)* | 100% stacked column: fate mix × 9 residue streams · KPI: **81.8% burn end-of-life residue** · burn-rate choropleth by district · burn % × crop type / project · composting adoption (low → intervention target) |
| **C** | **Farmer & Farm Profile** | Gender donut · age-band bars · literacy bars · household-size dist. · co-op membership · disability & digital-access inclusion strip · device-type donut |
| **D** | **Crop & Farm Characteristics** | Crop-type donut (shaded vs monocrop) · area distribution (normalised ha) · plant-density dist. · crop-age bands · soil type · dead-plant % |
| **E** | **Production & Yield** | Total yield KPI · **yield intensity t/ha** by crop type & region · yield-vs-inputs cross-tab · *lifecycle curve (flagged: template data — see §17)* |
| **F** | **Fertiliser & Nutrient Inputs** | Adoption **50.3%** · organic vs synthetic split · top fertiliser types bar · **kg N/ha applied** (parsed) · production-region mix · rate distribution (unit-normalised) |
| **G** | **Crop Protection** | Adoption **29.6%** · type bar (herbicide/fungicide/…) · category donut · **AI load per ha** · % field treated dist. |
| **H** | **Agroforestry & Non-Crop Vegetation** | Shade-tree adoption **78.6%** · **median shade cover 7%** · shade-type bar (typo-merged) · intercrop adoption **71.4%** + type bar · hedge adoption **14.8%** + derived hedge area |
| **I** | **Land Use Change & Forest** | **Sankey/matrix: previous → new land use** (906 transitions) · forest-change donut (256 reforestation / 65 deforestation) · net area re/deforested KPI · change-year timeline |
| **J** | **Transport & Logistics** | Mode bar (**88% motorbike**) · boundary split · **tonne-km** KPI · distance dist. |
| **K** | **Rare Inputs** *(merged §6/9/10 — thin data)* | Energy adoption 4.3% reported / 3.1% documented (litres by source) · irrigation adoption 0.6% (**99.4% rain-fed** KPI) · wastewater 0.4% reported / 1 row documented (table) — each labelled with its low n |
| **L** | **Geography** | Point map (3,254 valid GPS) · region/district choropleth switchable by metric (burn rate, shade cover, N/ha, adoption) |
| **M** | **Data Quality & Field Activity** | Submissions by month · by enumerator (66) · **"said yes, entered nothing" gaps (733 rows total)** · unit-mix warnings · out-of-range flags · duplicate names/phones · 7-version drift |

---

## 6. §17 — Data quality register

Carried into Phase 2 as explicit cleaning rules and into section M as a visible tile.

**Blocking (must fix before any aggregation)**
1. **Unit normalisation** — area (acres 3,003 / ha 251), plant density, fertiliser rate (6 units), pesticide rate (5), transport weight (kgs 2,996 / t 582), irrigation volume, reforested area. Convert everything to ha / kg / litres / km at load.
2. **`shade_tress_type` typo merge** — `Torpical*` → `Tropical*` (**413 instances**), else the top category splits three ways.
3. **`crop_type`** — `cocoa_monocrop` → `cocoa monocrop` (1 row).
4. **`enumerator_name`** — trim/case-normalise: 79 raw → 66 real people.
5. **`energy_use_category`** — select_multiple: split on space.

**Systematic integrity issues (surface, don't silently drop)**
6. **"Said yes, entered nothing" — 733 rows.** shade_tress 320, intercrop 158, hedge 73, fertilizer 67, fuel 38, pesticide 34, land-use 26, irrigation 6, wastewater 11. No inverse cases (never rows without a yes), so it is pure under-entry.
7. **Offset-vs-calendar-year confusion** — `pruning_constant_pruning_start_year` (p95 2031, max 2053), `land_use_change_year` (min 3), `de_final_year_pruning_perc` (max 2049). Rule: >1900 = calendar, else offset.
8. **Out-of-range values** — `active_ingredient` max 180% (impossible); `expected_lifecycle_years` 2006/504/503; `pruning_constant_pruning_val` max 2025; `hedge_width` median 40 m.
9. **Magnitude outliers** — `total_yield_assessment_year` max 6,000 t (median 1.0); `growing_area` 182 ha; `fertiliser_application_rate` 40,000; 239 rows at t/acre with median 60. Winsorise for display; keep raw; flag.
10. **Residue splits not summing to 100** — 34 rows ≠100, 8 rows =0 (of 3,254 — negligible but flag).

**Interpretation caveats**
11. **Yield curves are largely template data** — 1,622 distinct curves for 3,254 rows (top curve repeated 231×), and **2,778 rows show a mature crop (age>3) with year-0 yield = 0**. The curves describe a generic crop lifecycle, not the farm. → label clearly or omit; **do not** present as farm performance.
12. **Lifecycle truncation** — 2,399 rows have `expected_lifecycle_years` > 30 but only 31 year columns exist, so curves are cut short.
13. **7 form versions** — the shade-tree typo and the 29 stray `pruning_est_year_*` rows both trace to version drift.
14. **Duplicates** — 74 rows share a first+other-name pair; 139 duplicate phone numbers. Possible double-enrolment; needs field confirmation, not automated dedup.

**PII — handling rule (non-negotiable)**
15. `farmer_first_name`, `farmer_other_names`, `phone_number`, `meta/instanceName` (= first name), precise `registration_gps`, `enumerator_name`, and the free-text comment fields are personal data. **The analytics store must exclude names and phone numbers entirely**; GPS should be stored but served only aggregated/jittered to non-privileged roles. `data/raw/` is gitignored and must never be committed or deployed.

---

## 7. What Phase 2 needs from you

1. **✅/✏️ Approve this inventory.**
2. **⏸ Decide the CO2e question** (§4) — recommendation: **option (a)**, practice level + derived intensities.
3. **Confirm two scope calls:** drop country as a filter (Uganda-only), and merge wastewater/irrigation/energy into one "Rare Inputs" panel (B/K above).
4. **Confirm the PII rule** in §6.15 — specifically that names and phone numbers are excluded from Supabase rather than stored-and-restricted.
