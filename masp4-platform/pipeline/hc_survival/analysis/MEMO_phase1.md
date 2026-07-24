# Advisory Memo — Tree-Survival Monitoring (Phase 1 analysis)

**To:** Geoffrey Rotich, M&E — Solidaridad ECA MASP IV Data Platform
**Re:** Kobo tree-survival monitoring — two forms analysed, dashboard-readiness verdict
**Scope:** Harvesting Carbon (Uganda) + SAVE KE (Kenya) survival monitoring. Analysis only — no build.

---

## 0. What was analysed

| | Form 1 | Form 2 |
|---|---|---|
| Asset UID | `aVfWPw45B9gB46AEJXVHwS` | `ahSMK3J7qQngQnXd76JkzF` |
| id_string | `Harvesting_Carbon_Tree_Survival_Assessment_v26_02_21` | *(blank; identified by UID + CSV + structure)* |
| Programme / country | Harvesting Carbon — **Uganda** | SAVE KE — **Kenya (Nyandarua)** |
| Grain | Batch (one row/visit, species pooled) | **Species repeat** (per-species rows) |
| Farmer registry CSV | `hc_seedlings_dist_20260329.csv` | `approved_farmers_records_20251110.csv` |
| Submissions | 208 (201 farmers, 1 campaign Mar–Apr 2026) | 2,157 (**866 farmers × ~2.5 visits**, 4 waves Dec-24→Jul-26) |
| Species rows | — | 12,728 |

**Both clear the n≥30 gate.** They are two country cohorts of one shared survey lineage — *not* the same population — which is the single most important framing for the dashboard (see §5).

---

## 1. Headline findings

- **Survival is materially different between cohorts and should never share a trend line.** Uganda pooled survival (alive/planted) = **71.3%** (median 83%); Kenya = **55.3%** (median 63%). Different country, species set (only *Calliandra* overlaps), season and grain — the gap is not a "form effect", it's four confounds at once.
- **Species is the dominant, actionable driver in Kenya.** Pooled survival runs from **Neem 33%** and Calliandra ~48% up to **Avocado 65% / Dombeya 61% / Grevillea 59%**. Adjusted odds of survival for Neem are **0.35×** an Apple seedling (95% CI 0.30–0.41). Species mix, not geography, decides Kenyan outcomes (admin-level effects are null).
- **In Uganda, location dominates.** Adjusting for everything else, **Wakiso survival odds are 0.15×** Mityana's (CI 0.11–0.19) while Sheema is 1.4× — a ~6× odds spread across just four districts. Drought is the stated cause of **68%** of Ugandan tree deaths.
- **Farmers' self-reported growth perception is a *valid* proxy for real survival** in both cohorts (monotonic: "Very Good" → ~100% median survival; "Poor/Very Poor" → 3–25%). This is a cheap, single-question signal worth surfacing on the dashboard.
- **Measured survival declines across Kenyan monitoring waves** (W1 2024Q4 → W4 2026: OR 1.0 → 0.48). Whether this is genuine decline, drier-season monitoring, or later waves capturing younger plantings cannot be resolved without a clean planting date (see §6).
- **Coffee outperforms agroforestry trees** in Uganda: coffee seedling survival **92%** (n=72 farmers), vs 71% for trees — a bright spot worth its own tile.

---

## 2. Data-quality verdict

**Kenya (Form 2) is close to dashboard-ready; Uganda (Form 1) needs two field-level fixes first. Neither is ready for a *farmer-level* view yet.**

> **Correction (Phase 2):** the "12% Form 1 lookup failure" below was an extraction artefact in the Phase 1 pandas code. The robust per-record extractor used by the production pipeline shows the **UG farmer lookup resolves 100%**. The real field-level gap is **gender (33% missing in the registry)** — that, not lookup failure, is what blocks gender-disaggregated views.

| Check | Form 1 (UG) | Form 2 (KE) | Flag |
|---|---|---|---|
| Farmer registry lookup resolved | **100%** *(was mis-stated as 88%)* | 100% | OK |
| Farmer gender present | **67.3%** | *field absent* | **UG gender 33% blank; KE has no gender at all** |
| planted+not_planted ≈ collected | 98.9% | 95.5%¹ | OK |
| alive+dead ≤ planted (+missing) | 93.5% (13 over) | 99.3% | minor |
| survival ≤ 1 (alive ≤ planted) | 99.5% (1) | 99.7% (41 rows) | add Kobo constraint |
| collected ≤ 1.5× registry-issued | 90.1% (20 high) | 99.4% | UG outliers to review |
| GPS present & in-country | 96.6% / 100% | **76.5%** / 99.9% | **KE: 23.5% missing GPS** |
| Duplicate farmer + month | 14 rows | 143 rows² | investigate |
| `cooperative` populated | n/a | **~50%** ("Not provided", 111 dirty variants) | clean before coop cut |
| `crop_failure` completeness | n/a | 76.5% | relevance-gated |

¹ Form 2's `amount_species_notplanted` is relevance-gated (only asked when "not planted = yes"); blank ≈ 0, so true consistency is higher than the raw figure. ² Form 2 is **longitudinal by design** — most farmer repeats are legitimate re-visits across waves, not duplicates; only same-farmer-same-month rows are true duplicate risks.

**Specific fixes (all now handled defensively in the Phase 2 pipeline):**
1. **Form 1 gender is 33% blank in the registry** → gender-disaggregated views are unreliable for Uganda; Kenya has no gender field at all. (Lookup itself resolves 100% — see correction above.)
2. **Form 2 `transfer_the_trees` is effectively free text** (40+ spellings of "motorbike"/"sack") → recoded to a controlled list (`transport_clean`) in the pipeline.
3. **Form 2 GPS missing 23.5%** → any Kenya map will show only ¾ of visits.
4. Auto-name traps documented in `out/dict_misleading_flags.csv` (e.g. Form 1 `How_many_seedlings_did_you_receive` is **coffee**, not trees; `Species_name` is a photo caption, not species data).

---

## 3. What drives survival (for a programme lead)

**Kenya:** *Which tree you plant matters far more than where you plant it.* Neem and Calliandra are dragging the average down; avocado, dombeya and grevillea carry it. Shifting the species mix (or targeting replacement/gapping at the weak species) is the highest-leverage lever. Geography within Nyandarua barely moves the needle. Hand-carrying seedlings is associated with *better* survival than wheelbarrow/vehicle transport — most plausibly because hand-carry = short distance from distribution point = less transplant stress (moderate confidence; the transport field is messy).

**Uganda:** *Where the farmer is matters most.* Wakiso is the clear problem district; Sheema and Mityana do well. Drought is the overwhelming killer (68% of deaths), so Wakiso's gap points to a water/site-selection issue rather than a species one. Motorcycle transport outperformed head/hand carrying here.

**Both:** ask the farmer how growth is going — their answer tracks the hard survival numbers closely, so it's a reliable early-warning field.

**Two things NOT to conclude:**
- *"Training reduces survival."* The data shows untrained Kenyan farmers with slightly higher survival, but this is an artefact — 94% received training, the tiny untrained group clusters in the high-survival first wave, and the within-wave direction is inconsistent. **Not a real effect; do not report it.**
- *"Farms cluster strongly."* A farmer random-intercept model returned ICC ≈ 0 — once species and wave are accounted for, between-farm variance is negligible. A flat regression is adequate here; we used cluster-robust SEs anyway as the conservative choice.

*Method note:* survival modelled as grouped binomial logistic (alive out of planted). Form 1: quasi-binomial (overdispersion 4.0×), n=186. Form 2: cluster-robust by farmer, n=12,315 across 859 farmers. All VIFs < 2.1 after using modal reference categories (initial inflation was a small-reference-cell artefact, not real collinearity). A top-quartile "high-mortality" classifier was weak (pseudo-R² 0.06) — **not** yet worth operationalising as a risk flag.

---

## 4. Recommended KPIs (refreshable from new Kobo submissions)

Reported **per cohort**, never pooled.

| # | KPI | Exact calculation |
|---|---|---|
| 1 | **Seedling survival rate** | Σ`alive` / Σ`planted`. F1: `…How_many_seedlings_a_a_healthy_condition` / `…How_many_seedlings_did_you_plant`. F2: Σ`survival_rate/amount_species_healthy` / Σ`survival_rate/amount_species_planted` |
| 2 | **Establishment (planting) rate** | Σ`planted` / Σ`collected` — catches losses *before* survival (non-planting). F1 `…How_many_total_seedl_participated_in_both`; F2 `total_seedlings_received` |
| 3 | **Survival by species** *(F2)* | Σalive/Σplanted grouped by `survival_rate/species_name` — the single most decision-useful cut |
| 4 | **Survival by location** | F1 by `district`; F2 by `farmer__admin_level_3` |
| 5 | **Mortality-cause mix** | ranked buckets of `…reason_for_death_or_damage` / `reason_species_death` (drought / livestock / theft) |
| 6 | **Growth-perception index** | % "Good/Very Good" of `region_growth_comparison` (F2) / `How_does_the_trees_g…` (F1) — validated cheap proxy |
| 7 | **Coffee seedling survival** *(F1)* | `…How_many_coffee_seed_ings_are_alive_today` / `…How_many_coffee_seedlings_did_you_plant` |
| 8 | **Environmental-outcome index** *(F2)* | % Yes across `forest_cover_increase`, `soil_quality_improvement`, `biodiversity_evidence`, `deforestation_reduction` |
| 9 | **Data-completeness (ops KPI)** | % farmer-lookup resolved + % GPS present — keeps the field teams honest |

Avoided as vanity/undefendable: raw submission counts, pooled cross-country survival, cooperative-level survival (until the field is cleaned), gender-disaggregated survival for Kenya (field absent).

---

## 5. Recommended cuts / filters

Based on where variation actually appeared:

- **Cohort / form-version (UG vs KE)** — mandatory top-level separator; everything else nests under it.
- **Species** (F2) — the biggest source of variation; must be filterable.
- **District** (F1) / **admin_level_3** (F2) — strong in UG, weak but expected in KE.
- **Monitoring wave / period** — F2 is a genuine time series; expose it.
- **Growth perception** and **mortality cause** — useful secondary slices.
- **Transport** — only *after* it's recoded to a controlled list.

*Not worth exposing yet:* cooperative (50% missing/dirty), training (no variance), gender for KE (absent).

---

## 6. Open questions / risks for Phase 2

1. **Form 2 repeat-group reshape must be a documented pipeline step.** Kobo's flat CSV collapses the `survival_rate` repeat; the species grain only survives via JSON/XML. The reshape (explode repeat → long species table + aggregate-to-batch) is built in `prep.py` and must be ported to the Supabase load, not left to the "Import CSV" page.
2. **Grain = keep separate (option b), confirmed.** Two tables — a batch-fact table (both forms) and a species-fact table (F2 only) — joined by submission/farmer ID. Do **not** merge into one row set; F2 species detail is an enrichment layer.
3. **Fix Form 1 farmer-lookup (12% fail) and gender (33% missing) before any farmer-level view.**
4. **Wave decline needs disambiguation** — genuine decline vs season vs plantation age. Requires a reliable planting date, which neither form captures cleanly. Flag on the dashboard rather than assert a trend.
5. **Kenya has no gender field** — if donor reporting needs gender-disaggregated survival, it must be added to the F2 registry lookup or the form.
6. **Add Kobo validation constraints** (`alive ≤ planted`, `planted ≤ collected`) to stop impossible values at source.
7. **Small-n caveat for Uganda:** 199 valid records, 4 districts, one campaign — treat UG findings as indicative, not definitive; they'll firm up as monitoring continues.

---

*Artefacts:* `out/dict_form1.csv`, `out/dict_form2.csv`, `out/dict_misleading_flags.csv`, `out/data_quality.csv`, `out/model_form1_or.csv`, `out/model_form2_or.csv`, `out/fig1–4*.png`; reproducible pipeline in `prep.py → dq.py → descriptives.py → models.py`.

**Stopping here per brief — awaiting go-ahead before any Phase 2 (Supabase / Next.js / Vercel) build.**
