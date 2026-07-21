"""
Build two self-contained static survival dashboards from the clean pipeline data:

  public/HC_Survival_UG_Dashboard.html   (Harvesting Carbon — Uganda, batch grain)
  public/SAVE_KE_Survival_Dashboard.html (SAVE KE — Kenya, species grain)

Kept SEPARATE per the Phase-2 decision (different countries/species/grain — never
pooled). Default view = KPI tiles + filters; regression/risk findings live on a
secondary "Insights" tab. Rendered client-side by dashboard_template.html.
"""
import os, io, json, html, collections
import transform

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TEMPLATE = os.path.join(HERE, "dashboard_template.html")
GEN = "2026-07 (pipeline/hc_survival)"

def opts(records, field):
    return sorted({r[field] for r in records if r.get(field) not in (None, "")})

def loss_table(records, field="reason_death_bucket"):
    c = collections.Counter(r[field] for r in records if r.get(field))
    tot = sum(c.values()) or 1
    return [{"label": k, "pct": round(100*v/tot, 1), "n": v}
            for k, v in c.most_common(8)]

def pct_positive(records, field, prefixes=("yes", "present", "increase", "improv")):
    vals = [str(r[field]).strip().lower() for r in records if r.get(field) not in (None, "")]
    if not vals: return None, 0
    hit = sum(1 for v in vals if v.startswith(prefixes))
    return round(100*hit/len(vals), 1), len(vals)

def chartblock(title, cid, note="", h=300):
    return (f'<div class="block"><h3>{html.escape(title)}</h3>'
            f'<div class="chartbox" style="height:{h}px"><canvas id="{cid}"></canvas></div>'
            f'{f"<div class=note>{note}</div>" if note else ""}</div>')

# ---------------------------------------------------------------- build one cohort
def build(cohort, all_batch, all_species):
    is_ke = cohort == "KE_SAVE"
    batch = [b for b in all_batch if b["cohort"] == cohort]
    species = [s for s in all_species] if is_ke else []

    # slim record objects for the client (only what filters/charts need)
    def loc(b): return b.get("admin3") if is_ke else b.get("district")
    records = [dict(
        loc=loc(b), species_taken=b.get("species_taken"), transport=b.get("transport_clean"),
        growth=b.get("growth_perception"), wave=b.get("monitoring_wave"),
        planted=b.get("planted"), alive=b.get("alive"), collected=b.get("collected"),
        coffee_planted=b.get("coffee_planted"), coffee_alive=b.get("coffee_alive"),
        farmer_id=b.get("farmer_id"), gps_ok=b.get("geo_in_bounds"),
    ) for b in batch]

    sp_records = []
    if is_ke:
        parent = {b["kobo_id"]: b for b in batch}
        for s in species:
            p = parent.get(s["submission_kobo_id"], {})
            sp_records.append(dict(
                species=s.get("species"), loc=s.get("admin3"), wave=s.get("monitoring_wave"),
                transport=p.get("transport_clean"), growth=p.get("growth_perception"),
                planted=s.get("planted"), alive=s.get("alive"),
                farmer_id=s.get("submission_kobo_id"), gps_ok=p.get("geo_in_bounds")))

    # filters
    if is_ke:
        filters = [
            dict(id="loc", label="Sub-county (admin3)", field="loc", options=opts(records, "loc")),
            dict(id="wave", label="Monitoring wave", field="wave", options=opts(records, "wave")),
            dict(id="transport", label="Transport", field="transport", options=opts(records, "transport")),
            dict(id="growth", label="Growth perception", field="growth", options=opts(records, "growth")),
        ]
    else:
        filters = [
            dict(id="loc", label="District", field="loc", options=opts(records, "loc")),
            dict(id="species_taken", label="Species taken", field="species_taken", options=opts(records, "species_taken")),
            dict(id="transport", label="Transport", field="transport", options=opts(records, "transport")),
            dict(id="growth", label="Growth perception", field="growth", options=opts(records, "growth")),
        ]

    # static blocks
    loss = loss_table(species if is_ke else batch)
    env_block = None
    if is_ke:
        eb = []
        for fld, lab in [("forest_cover_increase", "Forest cover ↑"), ("soil_quality_improvement", "Soil quality ↑"),
                         ("biodiversity_evidence", "Biodiversity ↑"), ("deforestation_reduction", "Deforestation ↓"),
                         ("economic_benefits_products", "Economic benefit")]:
            p, n = pct_positive(batch, fld)
            if p is not None: eb.append({"label": lab, "pct": p, "n": n})
        env_block = eb

    # insights (from Step 3 modelling)
    if is_ke:
        insights = [
            {"title": "Species is the dominant driver", "body": "Adjusted odds of survival range from Neem <b>0.35×</b> an Apple seedling (95% CI 0.30–0.41) up to Avocado <b>1.72×</b>. Grouped logistic, cluster-robust by farmer (n=12,315; 859 farmers). Target replacement/gapping at Neem &amp; Calliandra."},
            {"title": "Geography within Nyandarua barely matters", "body": "admin-level-3 effects are null (OR ≈ 1.0, p&gt;0.7). Which species is planted, not where, decides Kenyan survival."},
            {"title": "Farmer growth-perception is a valid signal", "body": "“Very Good” perception → 2.0× the survival odds of “Good”; monotonic with hard counts. A cheap single-question early-warning field."},
            {"title": "Survival declines across monitoring waves", "body": "W4 (2026) shows <b>0.48×</b> the odds of W1 (2024Q4). Cohort-age vs calendar/season cannot be separated without a clean planting date — treat as a flag, not a proven trend."},
            {"title": "Transport: hand-carry ≥ mechanized", "body": "Wheelbarrow/vehicle show lower survival than head/hand carrying — most plausibly a distance/transplant-stress proxy. Moderate confidence (transport field was free-text, recoded)."},
            {"title": "Do NOT read the training coefficient", "body": "94% of farmers were trained; the tiny untrained group clusters in the high-survival first wave and the within-wave direction is inconsistent. The apparent “training lowers survival” is a confounded artefact.", "warn": True},
            {"title": "Risk-flag model is weak so far", "body": "A top-quartile high-mortality classifier reached only pseudo-R²=0.06. Not yet reliable enough to operationalise as an automated risk flag.", "warn": True},
        ]
    else:
        insights = [
            {"title": "Location dominates survival", "body": "Adjusting for everything else, <b>Wakiso</b> survival odds are <b>0.15×</b> Mityana's (95% CI 0.11–0.19) while Sheema is 1.4×. A ~6× odds spread across four districts. Quasi-binomial GLM (overdispersion 4×, n=186)."},
            {"title": "Drought is the overwhelming killer", "body": "68% of stated tree deaths are drought/water-stress. Wakiso's gap points to a water/site-selection problem, not a species one."},
            {"title": "Motorcycle transport outperformed head/hand", "body": "Motorcycle survival odds 1.34× head/hand carrying (p&lt;0.001) — opposite to Kenya, consistent with a different distribution logistics setup."},
            {"title": "Growth-perception tracks reality", "body": "“Very Good” → ~100% median survival; “Poor/Very Poor” → 3–13%. Self-report is a reliable proxy."},
            {"title": "Coffee outperforms agroforestry trees", "body": "Coffee seedling survival 92% (n=72 farmers) vs 71% for trees — a distinct bright spot."},
            {"title": "Small-sample caveat", "body": "208 records, 4 districts, one campaign (Mar–Apr 2026). Treat Uganda findings as indicative; they will firm up as monitoring continues.", "warn": True},
        ]

    # data-quality rows
    def cnt(pred): return sum(1 for b in batch if pred(b))
    dq = [
        {"check": "Seedling survival (alive/planted, pooled)", "value": f'{100*sum((b["alive"] or 0) for b in batch)/max(sum((b["planted"] or 0) for b in batch),1):.1f}%', "note": "KPI 1"},
        {"check": "Farmer registry lookup resolved", "value": f'{100*cnt(lambda b:b["farmer_lookup_ok"])/len(batch):.1f}%', "note": "defensive flag"},
        {"check": "GPS present", "value": f'{100*cnt(lambda b:b["lat"] is not None)/len(batch):.1f}%', "note": "map coverage"},
        {"check": "Rows with a DQ flag", "value": f'{100*cnt(lambda b:b["dq_flags"])/len(batch):.1f}%', "note": "see dq_flags column"},
        {"check": "Impossible survival clipped (alive&gt;planted)", "value": str(cnt(lambda b: b["dq_flags"] and "alive>planted" in b["dq_flags"])), "note": "clipped to planted"},
    ]
    if is_ke:
        dq.append({"check": "Cooperative populated (after cleaning)", "value": f'{100*cnt(lambda b:b["cooperative"])/len(batch):.1f}%', "note": "“Not provided” → null"})
    else:
        dq.append({"check": "Farmer gender present (registry)", "value": f'{100*cnt(lambda b:b["farmer_gender"])/len(batch):.1f}%', "note": "blocks gender views"})

    # sections html
    overview = ('<div class="filters" id="filters"></div><div class="kpis" id="kpis"></div>'
                '<div class="grid">'
                + chartblock(("Survival by species" if is_ke else "Survival by species taken"), "c_species", "Pooled alive/planted. Red &lt;50%, amber &lt;60%.")
                + chartblock(("Survival by sub-county" if is_ke else "Survival by district"), "c_loc")
                + chartblock("Survival by transport", "c_transport")
                + chartblock("Survival by growth perception", "c_growth", "Farmer-reported growth vs actual survival.")
                + (chartblock("Survival by monitoring wave", "c_wave", "Species-level, over time.", 260) if is_ke else "")
                + '</div>')
    breakdown = ('<div class="grid">'
                 + chartblock("Loss / mortality reasons", "c_loss", "Ranked share of stated death causes.")
                 + (chartblock("Environmental & economic outcomes (% positive)", "c_env", "Share answering positively.") if is_ke
                    else '<div class="block"><h3>Coffee sub-section</h3><div id="coffeebox"></div><div class=note>Coffee has its own survival chain — see the Coffee survival KPI tile.</div></div>')
                 + '</div>')
    sections = [
        {"id": "overview", "title": "Overview", "desc": DESC[cohort], "html": overview},
        {"id": "breakdown", "title": "Loss & context", "desc": "Why seedlings are lost, and cohort-specific context.", "html": breakdown},
        {"id": "insights", "title": "Insights (models)", "desc": "What drives survival — regression findings. Read the caveats.", "html": '<div id="insights"></div>'},
        {"id": "dq", "title": "Data quality", "desc": "Pipeline-level defensive cleaning. Issues are surfaced, not hidden.", "html": '<div class="block full"><table id="dqtable"></table></div>'},
    ]

    data = dict(
        cohort=cohort, title=TITLE[cohort], subtitle=SUB[cohort],
        filters=filters, records=records, species=sp_records if is_ke else [],
        sections=sections, loss_reasons=loss, env_block=env_block, insights=insights, dq=dq)

    tpl = open(TEMPLATE, encoding="utf-8").read()
    out = (tpl.replace("__TITLE__", html.escape(TITLE[cohort]))
              .replace("__H1__", H1[cohort])
              .replace("/*__DATA__*/", json.dumps(data, default=str, ensure_ascii=False)))
    dest = os.path.join(REPO_ROOT, "public", OUTFILE[cohort])
    open(dest, "w", encoding="utf-8").write(out)
    print(f"wrote {dest}  ({len(out)//1024} KB, {len(batch)} subs, {len(sp_records)} species rows)")

TITLE = {"UG_HC": "Harvesting Carbon — Uganda Tree-Survival Dashboard",
         "KE_SAVE": "SAVE KE — Kenya Tree-Survival Dashboard"}
H1 = {"UG_HC": "🌳 Harvesting Carbon — Uganda · Tree Survival",
      "KE_SAVE": "🌳 SAVE KE — Kenya · Tree Survival"}
SUB = {"UG_HC": "Batch-grain monitoring · 208 visits · Mar–Apr 2026",
       "KE_SAVE": "Species-grain monitoring · 2,157 visits · 866 farmers · Dec-2024→Jul-2026"}
DESC = {"UG_HC": "Harvesting Carbon agroforestry monitoring (Uganda). Counts are per-visit batch totals across all species. Use filters to slice; the Insights tab has the regression story.",
        "KE_SAVE": "SAVE KE agroforestry monitoring (Kenya, Nyandarua). Survival is measured per species within each visit. Filters recompute all KPIs and charts live."}
OUTFILE = {"UG_HC": "HC_Survival_UG_Dashboard.html", "KE_SAVE": "SAVE_KE_Survival_Dashboard.html"}

if __name__ == "__main__":
    batch, species = transform.run()
    build("UG_HC", batch, species)
    build("KE_SAVE", batch, species)
