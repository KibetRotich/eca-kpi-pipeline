"""
Build the self-contained Climate Vulnerability Assessment dashboard:

    public/Climate_Vulnerability_Dashboard.html

Bakes a compact, index-encoded per-household dataset (+ the admin-1 GeoJSON) into
dashboard_template.html so all six tabs recompute live under the global filters,
entirely client-side (Chart.js + Leaflet, no runtime backend). transform.run() is
the single source of cleaning logic, shared with the Supabase loader, so the
dashboard and the database never diverge.

Tabs: Coverage · Hazard exposure · Impacts · Sensitivity & adaptive capacity ·
      Adaptation uptake · Vulnerability matrix.
"""
import os, io, csv, json, html, collections
import transform

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TEMPLATE = os.path.join(HERE, "dashboard_template.html")
GEOJSON = os.path.join(HERE, "geo", "cva_admin1.geojson")
OUTFILE = os.path.join(REPO_ROOT, "public", "Climate_Vulnerability_Dashboard.html")

IMPACT_CATS = ["production", "harvest", "marketing", "social"]
IMPACT_CAT_LABELS = {"production": "Production", "harvest": "Harvest/Storage/Processing",
                     "marketing": "Produce marketing", "social": "Social"}
CAP_KEYS = transform.CAP_SCORE_KEYS
CAP_LABELS = {
    "grows_multiple_crops": "Grows >1 crop", "group_member": "Group/cooperative member",
    "uses_extension": "Uses extension", "uses_financial": "Uses financial services",
    "higher_education": "Completed higher education", "uses_equipment": "Uses equipment/machinery",
    "has_insurance": "Has crop insurance", "has_surplus": "Has surplus produce",
    "sells_surplus": "Sells surplus", "shares_knowledge": "Shares knowledge",
    "weather_access": "Accesses weather info", "in_seed_testing": "In seed-testing programme",
    "receives_market_trends": "Receives market trends", "reinvests": "Re-invests crop income",
    "mobile_internet": "Has mobile internet",
}
SRC_INDICATORS = ["extension", "financial", "weather", "knowledge", "reinvest"]
SRC_LABELS = {"extension": "Extension source", "financial": "Financial source",
              "weather": "Weather-alert platform", "knowledge": "Knowledge platform",
              "reinvest": "Re-investment activity"}
DOMAIN_LABELS = [d[0] for d in transform.DOMAINS]
ACI_SUB_LABELS = {"institutional": "Institutional & social (20)", "financial": "Financial (20)",
                  "information": "Information access (25)", "technical": "Technical/physical (20)",
                  "market": "Market resilience (15)"}
# fixed-threshold vulnerability quadrants (HEI≥50 / ACI<50 etc.) — colour + order
QUADRANTS = [{"key": "Critical", "label": "Critical (high exposure, low capacity)", "color": "#a31515"},
             {"key": "Stressed", "label": "Stressed (high exposure, resilient)", "color": "#e65100"},
             {"key": "Latent risk", "label": "Latent risk (low exposure, weak capacity)", "color": "#f9a825"},
             {"key": "Stable", "label": "Stable (low exposure, resilient)", "color": "#2e7d32"}]
CSVFILE = os.path.join(HERE, "data", "cva_farmer_indices.csv")


def _mis_code(m):
    """crop_alt_mismatch (1/0/None) -> record code (1 mismatch / 0 ok / -1 unknown)."""
    return -1 if m is None else m


def idx_map(values):
    """Stable index map for a list of distinct values (order preserved)."""
    m, out = {}, []
    for v in values:
        if v not in m:
            m[v] = len(out)
            out.append(v)
    return m, out


def write_farmer_csv(hh, indices, alt_by, hotspot_by, cluster_by):
    """Full per-farmer index table (one row per submission). Written to a file —
    never echoed row-by-row. Includes identity, geography (lat/lon/altitude/
    elevation band), both raw sub-scores and the composite HEI / ACI (+ 5
    sub-dimensions) / VI + quadrant, plus the geospatial flags (crop-altitude
    mismatch, spatial hotspot, cluster id)."""
    cols = ["kobo_id", "farmer_id", "name", "gender", "country", "admin1", "project",
            "main_crop", "lat", "lon", "altitude_m", "elevation_band", "n_hazards",
            "HEI_exposure", "ACI_capacity", "aci_institutional", "aci_financial",
            "aci_information", "aci_technical", "aci_market", "VI_vulnerability",
            "quadrant", "crop_alt_mismatch", "spatial_hotspot", "cluster_id",
            "priority_flag_median", "dq_flags"]
    os.makedirs(os.path.dirname(CSVFILE), exist_ok=True)
    with open(CSVFILE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for h in hh:
            kid = h["kobo_id"]
            ix = indices.get(kid, {})
            sub = ix.get("sub") or {}
            alt = alt_by.get(kid)
            mis = transform.crop_alt_mismatch(h["main_crop"], alt)
            w.writerow([
                kid, h["farmer_id"] or "",
                ((h["first_name"] or "") + " " + (h["last_name"] or "")).strip(),
                h["gender"] or "", h["country"] or "", h["admin1_label"] or h["admin1"] or "",
                h["project_label"] or "", h["main_crop"] or "",
                h["lat"] if h["lat"] is not None else "", h["lon"] if h["lon"] is not None else "",
                round(alt, 1) if alt is not None else "", transform.elevation_band(alt) or "",
                h["n_hazards"], h["hazard_exposure_score"], ix.get("aci"),
                *[(round(sub[k] * 100, 1) if sub.get(k) is not None else "")
                  for k in transform.ACI_SUBDIMS],
                ix.get("vi"), ix.get("quadrant") or "",
                "" if mis is None else mis, hotspot_by.get(kid, 0), cluster_by.get(kid, -1),
                1 if h["priority_flag"] else 0, h["dq_flags"] or ""])
    return len(hh)


def build():
    data = transform.run()
    hh = data["households"]
    indices = transform.enrich_indices(data)   # {kobo_id: aci/vi/quadrant/sub}

    # altitude comes straight off the household dict (transform parses the
    # gps_location 3rd token into households[].altitude, also persisted to Supabase).
    alt_by = {h["kobo_id"]: h.get("altitude") for h in hh}

    # ---- spatial pass: Moran's I on VI + DBSCAN hotspots on the high-VI subset ----
    geo_kids, geo_pts, geo_vi = [], [], []
    for h in hh:
        kid = h["kobo_id"]
        vi = indices.get(kid, {}).get("vi")
        if h["lat"] is not None and h["lon"] is not None and vi is not None:
            geo_kids.append(kid); geo_pts.append((h["lat"], h["lon"])); geo_vi.append(vi)
    morans, morans_w = transform.morans_i(geo_pts, geo_vi, eps_km=5.0)
    vsorted = sorted(geo_vi)
    vi_thr = vsorted[int(0.75 * len(vsorted))] if vsorted else 0.0     # high-VI = top quartile
    hi_local = [i for i, v in enumerate(geo_vi) if v >= vi_thr]
    hi_labels = transform.spatial_clusters([geo_pts[i] for i in hi_local], eps_km=5.0, min_pts=5)
    hotspot_by, cluster_by = {}, {}
    for li, lab in zip(hi_local, hi_labels):
        kid = geo_kids[li]
        cluster_by[kid] = lab
        hotspot_by[kid] = 1 if lab >= 0 else 0        # clustered = hotspot; noise = scattered
    n_clusters = len({l for l in hi_labels if l >= 0})

    n_csv = write_farmer_csv(hh, indices, alt_by, hotspot_by, cluster_by)

    # ---- group children by household ----
    haz_by = collections.defaultdict(list)
    for r in data["hazard_exposure"]:
        haz_by[r["household_kobo_id"]].append(r)
    imp_by = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in data["impacts"]:
        imp_by[r["household_kobo_id"]][r["category"]].append(r)
    cap_by = {r["household_kobo_id"]: r for r in data["capacity_ind"]}
    src_by = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in data["capacity_sources"]:
        src_by[r["household_kobo_id"]][r["indicator"]].append(r)
    adapt_by = collections.defaultdict(list)
    for r in data["adaptation"]:
        adapt_by[r["household_kobo_id"]].append(r)

    # ---- lookups ----
    countries = sorted({h["country"] for h in hh if h["country"]})
    ci = {c: i for i, c in enumerate(countries)}
    admin1 = []       # {key,label,country}
    a1i = {}
    for h in hh:
        k = h["admin1"]
        if k and k not in a1i:
            a1i[k] = len(admin1)
            admin1.append({"key": k, "label": h["admin1_label"] or k, "country": h["country"]})
    projects = sorted({h["project_label"] for h in hh if h["project_label"]})
    pi = {p: i for i, p in enumerate(projects)}
    genders = sorted({h["gender"] for h in hh if h["gender"]})
    gi = {g: i for i, g in enumerate(genders)}
    crops = sorted({h["main_crop"] for h in hh if h["main_crop"]}, key=lambda s: s.lower())
    cri = {c: i for i, c in enumerate(crops)}

    hazards = []      # {code,label}  (fixed order = first-seen)
    hzi = {}
    for r in data["hazard_exposure"]:
        if r["hazard_code"] not in hzi:
            hzi[r["hazard_code"]] = len(hazards)
            hazards.append({"code": r["hazard_code"], "label": r["hazard_label"] or r["hazard_code"]})

    impacts = {c: [] for c in IMPACT_CATS}   # per category list of {code,label}
    impi = {c: {} for c in IMPACT_CATS}
    for r in data["impacts"]:
        c = r["category"]
        if r["impact_code"] not in impi[c]:
            impi[c][r["impact_code"]] = len(impacts[c])
            impacts[c].append({"code": r["impact_code"], "label": r["impact_label"] or r["impact_code"]})

    practices = [[] for _ in DOMAIN_LABELS]  # per domain list of {code,label}
    pri = [dict() for _ in DOMAIN_LABELS]
    dmi = {lab: i for i, lab in enumerate(DOMAIN_LABELS)}
    for r in data["adaptation"]:
        d = dmi[r["domain"]]
        code = r["practice_code"]
        if code and not code.startswith("__") and code not in pri[d]:
            pri[d][code] = len(practices[d])
            practices[d].append({"code": code, "label": r["practice_label"] or code})

    sources = {ind: [] for ind in SRC_INDICATORS}   # per indicator list of {code,label}
    srci = {ind: {} for ind in SRC_INDICATORS}
    for r in data["capacity_sources"]:
        ind = r["indicator"]
        if ind in srci and r["value_code"] not in srci[ind]:
            srci[ind][r["value_code"]] = len(sources[ind])
            sources[ind].append({"code": r["value_code"], "label": r["value_label"] or r["value_code"]})

    # ---- compact records (positional; see REC_* in the template) ----
    records = []
    for h in hh:
        kid = h["kobo_id"]
        H = [[hzi[r["hazard_code"]], r["severity_wt"] or 0, r["frequency_wt"] or 0]
             for r in haz_by.get(kid, [])]
        I = [[impi[c][r["impact_code"]] for r in imp_by[kid].get(c, [])] for c in IMPACT_CATS]
        cap = cap_by.get(kid, {})
        capstr = "".join("1" if cap.get(k) is True else "0" if cap.get(k) is False else "-"
                         for k in CAP_KEYS)
        adopted_mask = 0
        AP = [[] for _ in DOMAIN_LABELS]
        for r in adapt_by.get(kid, []):
            d = dmi[r["domain"]]
            if r["domain_adopted"]:
                adopted_mask |= (1 << d)
            code = r["practice_code"]
            if code and not code.startswith("__"):
                AP[d].append(pri[d][code])
        CS = [[srci[ind][r["value_code"]] for r in src_by[kid].get(ind, [])] for ind in SRC_INDICATORS]
        ym = (h["submitted_at"] or "")[:7]
        idx = indices.get(kid, {})
        aci = idx.get("aci")
        sub = idx.get("sub") or {}
        ACI_SUB = [round(sub[k] * 100, 1) if sub.get(k) is not None else -1
                   for k in transform.ACI_SUBDIMS]
        records.append([
            ci.get(h["country"], -1),
            a1i.get(h["admin1"], -1) if h["admin1"] else -1,
            pi.get(h["project_label"], -1),
            gi.get(h["gender"], -1),
            cri.get(h["main_crop"], -1),
            ym,
            h["age"] if h["age"] is not None else -1,
            h["household_size"] if h["household_size"] is not None else -1,
            1 if h["geo_in_bounds"] else 0 if h["geo_in_bounds"] is False else -1,
            1 if h["dq_flags"] else 0,
            round(h["hazard_exposure_score"] or 0, 1),
            round(h["adaptive_capacity_score"], 1) if h["adaptive_capacity_score"] is not None else -1,
            1 if h["priority_flag"] else 0,
            h["lat"], h["lon"],
            ((h["first_name"] or "") + " " + (h["last_name"] or "")).strip() or "—",
            h["farmer_id"] or "",
            H, I, capstr, adopted_mask, AP, CS,
            cap.get("education_level") or "",
            aci if aci is not None else -1,   # ACI (index 24); HEI = EX (index 10)
            ACI_SUB,                          # 5 sub-dimension scores 0-100 (index 25)
            round(alt_by.get(kid), 1) if alt_by.get(kid) is not None else -1,  # ALT (26)
            _mis_code(transform.crop_alt_mismatch(h["main_crop"], alt_by.get(kid))),  # MIS (27)
            hotspot_by.get(kid, 0),           # HOT spatial hotspot 0/1 (index 28)
            cluster_by.get(kid, -1),          # CLU cluster id, -1 = none (index 29)
        ])

    dates = sorted(r[5] for r in records if r[5])
    geojson = json.load(open(GEOJSON, encoding="utf-8"))

    payload = dict(
        meta=dict(
            n=len(records), form_uid=transform.FORM_UID,
            date_min=dates[0] if dates else "", date_max=dates[-1] if dates else "",
            n_hazard=len(data["hazard_exposure"]), n_impact=len(data["impacts"]),
            n_adapt=len(data["adaptation"]), generated=os.environ.get("CVA_GEN", "nightly build"),
        ),
        lookups=dict(
            countries=countries,
            admin1=admin1,
            projects=projects, genders=genders, crops=crops,
            hazards=hazards,
            impactCats=[{"key": c, "label": IMPACT_CAT_LABELS[c]} for c in IMPACT_CATS],
            impacts=[impacts[c] for c in IMPACT_CATS],
            domains=DOMAIN_LABELS, practices=practices,
            capKeys=[{"key": k, "label": CAP_LABELS[k]} for k in CAP_KEYS],
            srcInd=[{"key": s, "label": SRC_LABELS[s]} for s in SRC_INDICATORS],
            sources=[sources[s] for s in SRC_INDICATORS],
            aciSub=[{"key": k, "label": ACI_SUB_LABELS[k]} for k in transform.ACI_SUBDIMS],
            quadrants=QUADRANTS,
            elevBands=[{"lo": lo, "hi": hi, "label": lab} for lo, hi, lab in transform.ELEV_BANDS],
            aez=transform.AEZ_LABELS,
        ),
        geo=dict(
            morans_i=morans, morans_pairs=morans_w, vi_threshold=round(vi_thr, 1),
            n_high_vi=len(hi_local), n_hotspot=sum(1 for v in hotspot_by.values() if v == 1),
            n_scattered=sum(1 for v in hotspot_by.values() if v == 0), n_clusters=n_clusters,
            n_altitude=sum(1 for a in alt_by.values() if a is not None),
        ),
        geojson=geojson,
        records=records,
    )

    tpl = open(TEMPLATE, encoding="utf-8").read()
    out = tpl.replace("/*__DATA__*/", json.dumps(payload, default=str, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
    open(OUTFILE, "w", encoding="utf-8").write(out)
    print(f"wrote {OUTFILE}  ({len(out)//1024} KB, {len(records)} households, "
          f"{len(hazards)} hazards, {sum(len(p) for p in practices)} practices)")
    print(f"wrote {CSVFILE}  ({n_csv} per-farmer index rows)")
    print(f"geospatial: altitude on {payload['geo']['n_altitude']}/{len(records)} hh, "
          f"Moran's I(VI)={morans} over {morans_w} pairs, {n_clusters} hotspot cluster(s), "
          f"{payload['geo']['n_hotspot']} hotspot / {payload['geo']['n_scattered']} scattered "
          f"high-VI (thr {round(vi_thr,1)})")


if __name__ == "__main__":
    build()
