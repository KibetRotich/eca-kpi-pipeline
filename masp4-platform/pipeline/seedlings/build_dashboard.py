"""Build a single self-contained interactive HTML dashboard for the UG Tree
Seedlings Request dataset (NPL & REAP), covering all 9 insight sections.

Computation is done in pandas; results are emitted as a JSON blob of typed
"blocks" rendered client-side by generic JS + Chart.js. The Executive section
(9) filters client-side over an embedded record-level array. GPS / cooperative
maps are matplotlib PNGs embedded as base64.

Output: <repo>/public/Seedlings_Dashboard.html  (served by Next.js at /Seedlings_Dashboard.html)
"""
import os, io, json, base64, html, re
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# All paths derive from this script's location so it runs identically locally and
# in CI. HERE = pipeline/seedlings; REPO_ROOT = the masp4-platform repo root.
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DDIR = os.environ.get("SEEDLINGS_DATA_DIR", HERE)   # where the fetched CSVs live
OUT_HTML = os.environ.get("SEEDLINGS_OUT",
                          os.path.join(REPO_ROOT, "public", "Seedlings_Dashboard.html"))
os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)

QTY_CAP = 10_000
UGX_RATE = 1000
UG_LAT, UG_LON = (-1.5, 4.3), (29.5, 35.0)
PLACE = {"", "0", "00", "000", "0000", "00000", "000000", "na", "n/a", "none",
         "nil", "null", "-", ".", "x", "xx", "no", "ni", "yed", "n /a", "n.a"}
NEG_FEEDBACK = {"", "no", "ni", "n/a", "na", "none", "nil", "no.", "nothing",
                "n/a.", "no ", "yed", "non", "no comment", "no question", "0"}
REGION_FIX = {"southern_western": "south_western"}

# Uganda district boundaries (geoBoundaries gbHumanitarian ADM2, 135 districts)
# used for the GeoJSON choropleth. Refreshed alongside the data by the pipeline.
GEO_PATH = os.path.join(HERE, "geo", "uga_districts.geojson")
# data district spelling -> boundary shapeName (both lowercased). Extend as new
# spellings appear in the form; any unmatched district is reported at build time
# rather than silently dropped.
DISTRICT_ALIAS = {"amoru": "amuru", "kasanda": "kassanda", "namisidwa": "namisindwa"}


def miss(v):
    return str(v).strip().lower() in PLACE


def b64fig(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def to_native(o):
    if isinstance(o, dict):
        return {k: to_native(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [to_native(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if (pd.isna(o) or np.isinf(o)) else round(float(o), 4)
    if isinstance(o, float):
        return None if (pd.isna(o) or np.isinf(o)) else round(o, 4)
    return o


# ── Load & clean ──────────────────────────────────────────────────────────────
print("Loading...")
m = pd.read_csv(os.path.join(DDIR, "seedlings_main.csv"), dtype=str, keep_default_na=False)
it = pd.read_csv(os.path.join(DDIR, "seedlings_items.csv"), dtype=str, keep_default_na=False)
N = len(m)

num = lambda s: pd.to_numeric(s.replace("", np.nan), errors="coerce")
for c in ["total_seedlings", "total_seedlings_cost", "facilitation_cost",
          "transport_cost", "grand_total"]:
    m[c + "_n"] = num(m[c])
# Fold version-coded species variants — e.g. 'avocado __central' -> 'avocado',
# 'albizia_gummifera__central' -> 'albizia_gummifera' — the species analogue of
# REGION_FIX. Keeps charts clean while still letting genuinely new species appear.
it["advance_item"] = it["advance_item"].map(
    lambda s: re.sub(r"\s*__\w+$", "", str(s).strip().lower()).strip())
it["qty"] = num(it["advance_item_quantity"])
it["line_cost"] = num(it["total_line_cost"])
it["implausible"] = it["qty"] > QTY_CAP
itc = it[~it["implausible"]].copy()

m["impl"] = m["total_seedlings_n"] > QTY_CAP
m["region_norm"] = m["region"].replace(REGION_FIX).replace("", "(blank)")
m["proj"] = m["project"].where(m["project"].isin(["reap", "climate_heroes"]), "unknown")
m["coop_type"] = np.where(m["cooperative"].str.strip().str.lower().str.contains("individual|private", na=False),
                          "Individual/Private", "Cooperative member")

# datetimes
m["start_dt"] = pd.to_datetime(m["application_start"], errors="coerce", utc=True)
m["end_dt"] = pd.to_datetime(m["application_end"], errors="coerce", utc=True)
m["sub_dt"] = pd.to_datetime(m["_submission_time"], errors="coerce", utc=True)
# 8 records have device-clock errors (dates in "2017"); floor to campaign window
TIME_FLOOR = pd.Timestamp("2023-08-01", tz="UTC")
valid_t = m["start_dt"] >= TIME_FLOOR
m["start_dt"] = m["start_dt"].where(valid_t)
m["date"] = m["start_dt"].dt.date
m["ym"] = m["start_dt"].dt.strftime("%Y-%m")
m["week"] = m["start_dt"].dt.to_period("W").dt.start_time
m["dur_min"] = (m["end_dt"] - m["start_dt"]).dt.total_seconds() / 60
m["wit_dt"] = pd.to_datetime(m["witness_date"], errors="coerce", utc=True)
m["wit_delay"] = (m["wit_dt"] - m["start_dt"].dt.floor("D")).dt.days

# GPS
loc = m["application_location"].str.split(expand=True)
m["lat"] = num(loc[0]); m["lon"] = num(loc[1])
m["in_ug"] = m["lat"].between(*UG_LAT) & m["lon"].between(*UG_LON)

# enumerator identity
m["enum"] = m["enumarator_names"].where(~m["enumarator_names"].apply(miss), m["enumarator_names_other"])
m["enum"] = m["enum"].where(~m["enum"].apply(miss), np.nan)

mc = m[~m["impl"]].copy()              # cleaned main for sums (after all derived cols)

# join region onto items
m_idx = m.set_index("_id")
it = it.merge(m[["_id", "region_norm", "district", "proj"]], on="_id", how="left")
itc = itc.merge(m[["_id", "region_norm", "district", "proj"]], on="_id", how="left")

print(f"  N={N:,}  items={len(it):,}  clean items={len(itc):,}")

# Species list is DATA-DRIVEN (top species by volume) so species newly added to
# the Kobo form appear automatically once farmers request them — no code edit.
# Used for the region×species heatmap and the species-mix stacked chart.
SPECIES_DYN = [s for s in itc.groupby("advance_item")["qty"].sum()
               .sort_values(ascending=False).index if s][:12]
print(f"  species (data-driven, top {len(SPECIES_DYN)}): {SPECIES_DYN}")

SECTIONS = []   # each: {id,title,desc,blocks:[...]}


def sec(id, title, desc=""):
    s = {"id": id, "title": title, "desc": desc, "blocks": []}
    SECTIONS.append(s)
    return s


def add(s, block):
    s["blocks"].append(block)


def vc_block(series, title, top=None, horizontal=True, note="", axis="count"):
    v = series.value_counts()
    if top:
        v = v.head(top)
    return {"type": "bar", "title": title, "labels": list(map(str, v.index)),
            "values": [int(x) for x in v.values], "horizontal": horizontal,
            "axisLabel": axis, "note": note}


# ════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Regional & Geographic
# ════════════════════════════════════════════════════════════════════════════
s = sec("s1", "1 · Regional & Geographic", "Where farmers, seedlings and spend concentrate. Interactive district choropleth (GeoJSON boundaries) plus ranked bars and real-GPS point maps.")

add(s, vc_block(m["region_norm"], "Farmers (applications) by region", horizontal=True,
                axis="applications", note="south_western folds in southern_western (version coding)"))

dist_seed = mc.groupby("district")["total_seedlings_n"].sum().sort_values(ascending=False)
dist_seed = dist_seed[dist_seed.index != ""]
add(s, {"type": "bar", "title": f"Total seedlings by district (all {len(dist_seed)})",
        "labels": list(dist_seed.index), "values": [int(x) for x in dist_seed.values],
        "horizontal": True, "axisLabel": "seedlings", "tall": True})

dist_cost = mc.groupby("district")["grand_total_n"].sum().sort_values(ascending=False)
dist_cost = dist_cost[dist_cost.index != ""]
add(s, {"type": "bar", "title": "Grand total disbursed by district (UGX)",
        "labels": list(dist_cost.index[:30]), "values": [int(x) for x in dist_cost.values[:30]],
        "horizontal": True, "axisLabel": "UGX", "tall": True, "note": "top 30 districts"})

# ── District choropleth (GeoJSON) ─────────────────────────────────────────────
# Join per-district aggregates onto Uganda district boundaries. District names are
# normalized + aliased; unmatched districts are REPORTED (not silently dropped).
def norm_dist(v):
    v = str(v).strip().lower()
    return DISTRICT_ALIAS.get(v, v)

def round_coords(o, nd=3):
    if isinstance(o, list):
        if o and isinstance(o[0], (int, float)):
            return [round(float(o[0]), nd), round(float(o[1]), nd)]
        return [round_coords(x, nd) for x in o]
    return o

geo = json.load(open(GEO_PATH, encoding="utf-8"))
for ft in geo["features"]:
    ft["geometry"]["coordinates"] = round_coords(ft["geometry"]["coordinates"])
    ft["properties"] = {"name": ft["properties"].get("shapeName", "")}

mc_d = mc.copy()
mc_d["dkey"] = mc_d["district"].map(norm_dist)
dm = (mc_d[mc_d["dkey"] != ""].groupby("dkey")
      .agg(applications=("_id", "size"), seedlings=("total_seedlings_n", "sum"),
           disbursed=("grand_total_n", "sum")))
metric_lookup = {k: {"applications": int(r.applications),
                     "seedlings": int(r.seedlings) if not pd.isna(r.seedlings) else 0,
                     "disbursed": int(r.disbursed) if not pd.isna(r.disbursed) else 0}
                 for k, r in dm.iterrows()}
shape_keys = {ft["properties"]["name"].strip().lower() for ft in geo["features"]}
matched = 0
for ft in geo["features"]:
    mv = metric_lookup.get(ft["properties"]["name"].strip().lower())
    ft["properties"]["m"] = mv
    if mv:
        matched += 1
unmatched = sorted(set(metric_lookup) - shape_keys)
print(f"  choropleth: {matched} districts matched to boundaries; "
      f"{len(unmatched)} unmatched: {unmatched}")

add(s, {"type": "choropleth",
        "title": "District choropleth — applications · seedlings · disbursement",
        "geojson": geo,
        "metrics": [{"key": "applications", "label": "Applications"},
                    {"key": "seedlings", "label": "Seedlings"},
                    {"key": "disbursed", "label": "Disbursed (UGX)"}],
        "note": ("Uganda district boundaries: geoBoundaries gbHumanitarian ADM2. "
                 + (f"Unmatched data districts (excluded from the map): {', '.join(unmatched)}."
                    if unmatched else "All data districts matched to a boundary."))})

# GPS point map colored by region
fig, ax = plt.subplots(figsize=(7, 7))
pts = m[m["in_ug"]]
regs = [r for r in pts["region_norm"].value_counts().index][:9]
cmap = plt.get_cmap("tab10")
for i, r in enumerate(regs):
    d = pts[pts["region_norm"] == r]
    ax.scatter(d["lon"], d["lat"], s=3, alpha=0.3, color=cmap(i), label=r)
ax.set_title("Application GPS points by region"); ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude")
ax.legend(markerscale=4, fontsize=7, loc="upper right"); ax.grid(alpha=0.3)
add(s, {"type": "image", "title": "Point-density map (GPS) by region", "src": b64fig(fig)})

# GPS map colored by project (subset)
fig, ax = plt.subplots(figsize=(7, 7))
for i, p in enumerate(["reap", "climate_heroes"]):
    d = pts[pts["proj"] == p]
    ax.scatter(d["lon"], d["lat"], s=4, alpha=0.4, color=["#1565c0", "#e65100"][i], label=p)
ax.set_title("GPS points by project (where project recorded)"); ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude")
ax.legend(markerscale=4); ax.grid(alpha=0.3)
add(s, {"type": "image", "title": "Project footprint overlap (subset, 26% have project)", "src": b64fig(fig)})

# region × species heatmap
piv = (itc[itc["advance_item"].isin(SPECIES_DYN)]
       .pivot_table(index="region_norm", columns="advance_item", values="qty", aggfunc="sum", fill_value=0))
piv = piv.reindex(columns=[c for c in SPECIES_DYN if c in piv.columns])
add(s, {"type": "heatmap", "title": "Region × species — total seedlings",
        "ylabels": list(piv.index), "xlabels": list(piv.columns),
        "matrix": [[int(v) for v in row] for row in piv.values]})

# cooperative bubble map (centroid sized by farmer count)
coop_geo = (m[m["in_ug"]].groupby("cooperative")
            .agg(lat=("lat", "mean"), lon=("lon", "mean"), n=("_id", "size"))
            .reset_index())
coop_geo = coop_geo[(coop_geo["n"] >= 5) & (~coop_geo["cooperative"].str.lower().str.contains("individual|private"))]
fig, ax = plt.subplots(figsize=(7, 7))
sc = ax.scatter(coop_geo["lon"], coop_geo["lat"], s=np.sqrt(coop_geo["n"]) * 3,
                alpha=0.55, color="#e65100", edgecolor="k", linewidth=0.2)
ax.set_title("Cooperative locations (centroid, sized by farmer count)")
ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude"); ax.grid(alpha=0.3)
add(s, {"type": "image", "title": "Cooperative footprint & size", "src": b64fig(fig),
        "note": f"{len(coop_geo)} cooperatives with >=5 geolocated farmers"})

add(s, {"type": "note", "title": "Not computable",
        "text": "Participation relative to <b>registered</b> cooperatives per district (uganda_cooperatives) needs an external cooperative registry that is not in the submission data."})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Time Trends
# ════════════════════════════════════════════════════════════════════════════
s = sec("s2", "2 · Time Trends", "Application rollout over time, by region and project, with cost and turnaround trends.")

wk = m.dropna(subset=["week"])
weekly_reg = wk.pivot_table(index="week", columns="region_norm", values="_id", aggfunc="size", fill_value=0)
top_regs = m["region_norm"].value_counts().head(6).index.tolist()
weekly_reg = weekly_reg[[c for c in top_regs if c in weekly_reg.columns]]
add(s, {"type": "line", "title": "Weekly applications by region (top 6)",
        "labels": [d.strftime("%Y-%m-%d") for d in weekly_reg.index],
        "series": [{"label": c, "data": [int(x) for x in weekly_reg[c]]} for c in weekly_reg.columns]})

daily = mc.dropna(subset=["date"]).groupby("date")["total_seedlings_n"].sum().sort_index()
cum = daily.cumsum()
add(s, {"type": "line", "title": "Cumulative seedlings over time",
        "labels": [str(d) for d in cum.index],
        "series": [{"label": "cumulative seedlings", "data": [int(x) for x in cum.values]}]})

proj_wk = wk[wk["proj"] != "unknown"].pivot_table(index="week", columns="proj", values="_id", aggfunc="size", fill_value=0)
add(s, {"type": "line", "title": "Applications over time: climate_heroes vs reap",
        "labels": [d.strftime("%Y-%m-%d") for d in proj_wk.index],
        "series": [{"label": c, "data": [int(x) for x in proj_wk[c]]} for c in proj_wk.columns],
        "note": "only the 26% of records carrying a project value"})

peak = m["ym"].value_counts().sort_values(ascending=False).head(10)
add(s, {"type": "table", "title": "Peak enrollment months",
        "columns": ["month", "applications"],
        "rows": [[k, int(v)] for k, v in peak.items()]})

cost_t = mc.dropna(subset=["ym"]).groupby("ym")["grand_total_n"].mean()
add(s, {"type": "line", "title": "Avg grand_total per application over time (UGX)",
        "labels": list(cost_t.index),
        "series": [{"label": "avg grand_total", "data": [round(float(x), 0) for x in cost_t.values]}]})

dur = m[(m["dur_min"] > 0) & (m["dur_min"] < 240)]
dur_wk = dur.dropna(subset=["week"]).groupby("week")["dur_min"].mean()
add(s, {"type": "line", "title": "Avg form completion time (min) by week",
        "labels": [d.strftime("%Y-%m-%d") for d in dur_wk.index],
        "series": [{"label": "avg minutes", "data": [round(float(x), 1) for x in dur_wk.values]}],
        "note": "completion times 0–240 min only"})

wd = m["wit_delay"].dropna()
wd = wd[(wd >= -5) & (wd <= 60)]
hist, edges = np.histogram(wd, bins=range(-5, 62, 5))
add(s, {"type": "bar", "title": "Witness date − application date (days)",
        "labels": [f"{edges[i]}..{edges[i+1]}" for i in range(len(hist))],
        "values": [int(x) for x in hist], "horizontal": False, "axisLabel": "submissions",
        "note": f"{int((m['wit_delay'].dropna()>3).sum()):,} records have witness >3 days after application (possible backlog)"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Seedling Varieties
# ════════════════════════════════════════════════════════════════════════════
s = sec("s3", "3 · Seedling Varieties", "Species demand, mix by geography, and unlisted-species requests.")

spq = itc.groupby("advance_item")["qty"].sum().sort_values(ascending=False)
add(s, {"type": "bar", "title": "Species ranked by total seedlings requested",
        "labels": list(spq.index), "values": [int(x) for x in spq.values],
        "horizontal": True, "axisLabel": "seedlings"})

sp_reg = (itc[itc["advance_item"].isin(SPECIES_DYN)]
          .pivot_table(index="region_norm", columns="advance_item", values="qty", aggfunc="sum", fill_value=0))
add(s, {"type": "stacked", "title": "Species mix by region (stacked seedlings)",
        "labels": list(sp_reg.index),
        "series": [{"label": c, "data": [int(x) for x in sp_reg[c]]} for c in sp_reg.columns if c in sp_reg]})

avg_sp = itc.groupby("advance_item")["qty"].mean().sort_values(ascending=False)
add(s, {"type": "bar", "title": "Avg seedlings per request line, by species",
        "labels": list(avg_sp.index), "values": [round(float(x), 1) for x in avg_sp.values],
        "horizontal": True, "axisLabel": "avg qty/line"})

oth = itc[itc["other_species_name"].str.strip() != ""]["other_species_name"].str.strip().str.lower()
oth_top = oth.value_counts().head(25)
add(s, {"type": "table", "title": "Most-requested unlisted species (other_species_name)",
        "columns": ["species (free text)", "requests"],
        "rows": [[k, int(v)] for k, v in oth_top.items()],
        "note": f"{(itc['advance_item']=='others').sum():,} 'others' line-items; {oth.nunique():,} distinct free-text names"})

# species diversity per district (HHI) — low diversity = risk
def hhi(g):
    sh = g.groupby("advance_item")["qty"].sum()
    p = sh / sh.sum()
    return float((p ** 2).sum())
div = itc[itc["district"] != ""].groupby("district").apply(hhi, include_groups=False)
divn = itc[itc["district"] != ""].groupby("district").size()
div_df = pd.DataFrame({"HHI": div, "line_items": divn}).query("line_items>=50").sort_values("HHI", ascending=False)
add(s, {"type": "table", "title": "Districts with lowest species diversity (high HHI = over-reliance)",
        "columns": ["district", "HHI concentration", "line items"],
        "rows": [[i, round(r.HHI, 3), int(r.line_items)] for i, r in div_df.head(15).iterrows()],
        "note": "HHI near 1.0 = one species dominates; agronomic monoculture risk"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Costs & Financials
# ════════════════════════════════════════════════════════════════════════════
s = sec("s4", "4 · Costs & Financials", "Cost composition, reconciliation, distribution and a simple budget projection.")

comp = mc.groupby("region_norm")[["total_seedlings_cost_n", "facilitation_cost_n", "transport_cost_n"]].sum()
add(s, {"type": "stacked", "title": "Cost components by region (UGX)",
        "labels": list(comp.index),
        "series": [{"label": "seedlings cost", "data": [int(x) for x in comp["total_seedlings_cost_n"]]},
                   {"label": "facilitation", "data": [int(x) for x in comp["facilitation_cost_n"]]},
                   {"label": "transport", "data": [int(x) for x in comp["transport_cost_n"]]}]})

cps = (itc["line_cost"] / itc["qty"]).replace([np.inf, -np.inf], np.nan).dropna()
cps = cps[(cps > 0) & (cps < 5000)]
hist, edges = np.histogram(cps, bins=30)
add(s, {"type": "bar", "title": "Cost per seedling distribution (should be UGX 1,000)",
        "labels": [f"{int(edges[i])}" for i in range(len(hist))],
        "values": [int(x) for x in hist], "horizontal": False, "axisLabel": "line items",
        "note": f"median = UGX {cps.median():.0f}; {(abs(cps-1000)>1).sum():,} lines deviate from 1,000"})

recon = mc.copy()
recon["calc"] = recon[["total_seedlings_cost_n", "facilitation_cost_n", "transport_cost_n"]].sum(axis=1)
recon["diff"] = (recon["grand_total_n"] - recon["calc"]).abs()
mismatch = recon[recon["diff"] > 1]
add(s, {"type": "table", "title": "Grand-total reconciliation failures",
        "columns": ["_id", "grand_total", "sum(components)", "diff"],
        "rows": [[int(r["_id"]), int(r["grand_total_n"]), int(r["calc"]), int(r["diff"])]
                 for _, r in mismatch.head(20).iterrows()],
        "note": f"{len(mismatch):,} of {len(recon):,} records don't reconcile (|diff|>1 UGX)"})

coop_cost = (mc[mc["coop_type"] == "Cooperative member"].groupby("cooperative")["grand_total_n"]
             .sum().sort_values(ascending=False).head(20))
add(s, {"type": "bar", "title": "Top cooperatives by grand_total disbursed (UGX)",
        "labels": list(coop_cost.index), "values": [int(x) for x in coop_cost.values],
        "horizontal": True, "axisLabel": "UGX", "tall": True})

hist, edges = np.histogram(mc["grand_total_n"].dropna().clip(upper=500000), bins=40)
add(s, {"type": "bar", "title": "Grand_total distribution per application (UGX, capped 500k view)",
        "labels": [f"{int(edges[i]/1000)}k" for i in range(len(hist))],
        "values": [int(x) for x in hist], "horizontal": False, "axisLabel": "applications"})

# budget projection from weekly disbursement
wk_cost = mc.dropna(subset=["week"]).groupby("week")["grand_total_n"].sum()
recent = wk_cost.tail(8)
proj_wkly = float(recent.mean()) if len(recent) else 0
add(s, {"type": "kpi", "title": "Program cost & forward projection",
        "cards": [{"label": "Disbursed to date (UGX)", "value": f"{mc['grand_total_n'].sum():,.0f}"},
                  {"label": "Avg weekly (last 8wk)", "value": f"{proj_wkly:,.0f}"},
                  {"label": "Projected next 4wk (UGX)", "value": f"{proj_wkly*4:,.0f}"},
                  {"label": "Projected next 12wk (UGX)", "value": f"{proj_wkly*12:,.0f}"}],
        "note": "linear extrapolation of the last 8 active weeks; indicative only"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Efficiency & Operational Ratios
# ════════════════════════════════════════════════════════════════════════════
s = sec("s5", "5 · Efficiency & Operational", "Enumerator throughput, turnaround, and control-quality ratios.")

ve = m[m["enum"].notna()].copy()
ep = ve.groupby("enum").agg(subs=("_id", "size"), days=("date", "nunique")).reset_index()
ep["per_day"] = (ep["subs"] / ep["days"]).round(1)
ep = ep.sort_values("subs", ascending=False)
add(s, {"type": "bar", "title": "Top 20 enumerators by submissions",
        "labels": list(ep["enum"].head(20)), "values": [int(x) for x in ep["subs"].head(20)],
        "horizontal": True, "axisLabel": "submissions", "tall": True,
        "note": f"{ve['enum'].nunique():,} enumerators total"})

dur_e = (dur.groupby("enum")["dur_min"].mean().dropna())
de = dur_e.sort_values()
fast = de.head(10); slow = de.tail(10)
add(s, {"type": "table", "title": "Form completion time per enumerator (min)",
        "columns": ["enumerator", "avg minutes", "speed"],
        "rows": [[i, round(float(v), 1), "fastest"] for i, v in fast.items()]
                + [[i, round(float(v), 1), "slowest"] for i, v in slow.items()]})

# seedlings per minute
spm = ve.copy()
spm = spm[(spm["dur_min"] > 0) & (spm["dur_min"] < 240) & (~spm["impl"])]
spm_e = (spm.groupby("enum").apply(lambda g: g["total_seedlings_n"].sum() / g["dur_min"].sum(), include_groups=False)
         .replace([np.inf, -np.inf], np.nan).dropna().sort_values(ascending=False))
add(s, {"type": "bar", "title": "Seedlings per interview-minute (top 20 enumerators)",
        "labels": list(spm_e.head(20).index), "values": [round(float(x), 2) for x in spm_e.head(20).values],
        "horizontal": True, "axisLabel": "seedlings/min", "tall": True})

aa = m["farmer__already_applied"].str.strip().str.lower().isin(["yes", "true", "1"])
no_fid = m["have_farmer_id"].str.strip().str.lower().eq("no")
add(s, {"type": "kpi", "title": "Control / quality ratios",
        "cards": [{"label": "'Already applied' flag rate", "value": f"{aa.mean()*100:.2f}%"},
                  {"label": "No Farmer ID (have_farmer_id=no)", "value": f"{no_fid.mean()*100:.1f}%"},
                  {"label": "Manual ID fallback", "value": f"{(~m['manual_farmer_id'].apply(miss)).mean()*100:.1f}%"},
                  {"label": "Scanned Farmer ID", "value": f"{(~m['farmer_id'].apply(miss)).mean()*100:.1f}%"}]})

nfr = m[~m["no_farmer_id_reason"].apply(miss)]
nfr_piv = nfr.pivot_table(index="region_norm", columns="no_farmer_id_reason", values="_id", aggfunc="size", fill_value=0)
add(s, {"type": "stacked", "title": "Reason for missing Farmer ID, by region",
        "labels": list(nfr_piv.index),
        "series": [{"label": c, "data": [int(x) for x in nfr_piv[c]]} for c in nfr_piv.columns]})

# overhead ratio by region
ov = mc.groupby("region_norm").apply(
    lambda g: (g["facilitation_cost_n"].sum() + g["transport_cost_n"].sum()) / g["grand_total_n"].sum()
    if g["grand_total_n"].sum() else np.nan, include_groups=False).dropna().sort_values(ascending=False)
add(s, {"type": "bar", "title": "Overhead ratio (facilitation+transport ÷ grand_total) by region",
        "labels": list(ov.index), "values": [round(float(x) * 100, 1) for x in ov.values],
        "horizontal": True, "axisLabel": "% overhead"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 6 — Farmer & Cooperative Profiles
# ════════════════════════════════════════════════════════════════════════════
s = sec("s6", "6 · Farmer & Cooperative Profiles", "Cooperative vs individual uptake, ID coverage, project mix.")

ct = m["coop_type"].value_counts()
add(s, {"type": "bar", "title": "Applications: cooperative member vs individual/private",
        "labels": list(ct.index), "values": [int(x) for x in ct.values], "horizontal": False, "axisLabel": "applications"})

avg_req = mc.groupby("coop_type")["total_seedlings_n"].mean()
add(s, {"type": "bar", "title": "Avg seedlings requested: member vs individual",
        "labels": list(avg_req.index), "values": [round(float(x), 1) for x in avg_req.values],
        "horizontal": False, "axisLabel": "avg seedlings"})

coop_tbl = (mc[mc["coop_type"] == "Cooperative member"].groupby("cooperative")
            .agg(farmers=("_id", "size"), seedlings=("total_seedlings_n", "sum")).reset_index()
            .sort_values("farmers", ascending=False).head(25))
coop_tbl["seedlings_per_farmer"] = (coop_tbl["seedlings"] / coop_tbl["farmers"]).round(1)
add(s, {"type": "table", "title": "Top cooperatives: farmers vs seedling volume (uptake check)",
        "columns": ["cooperative", "farmers", "seedlings", "seedlings/farmer"],
        "rows": [[r.cooperative, int(r.farmers), int(r.seedlings), r.seedlings_per_farmer]
                 for r in coop_tbl.itertuples()],
        "note": "low seedlings/farmer at high membership = re-engagement opportunity"})

nid = (~m["farmer_national_id"].apply(miss))
add(s, {"type": "kpi", "title": "National ID verification coverage",
        "cards": [{"label": "Has national ID", "value": f"{nid.mean()*100:.1f}%"},
                  {"label": "Missing / placeholder", "value": f"{(~nid).mean()*100:.1f}%"},
                  {"label": "Records with ID", "value": f"{int(nid.sum()):,}"}]})

px = m[m["proj"] != "unknown"].pivot_table(index="region_norm", columns="proj", values="_id", aggfunc="size", fill_value=0)
add(s, {"type": "stacked", "title": "Project × region (where project recorded)",
        "labels": list(px.index),
        "series": [{"label": c, "data": [int(x) for x in px[c]]} for c in px.columns]})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 7 — Data Quality & Process Integrity
# ════════════════════════════════════════════════════════════════════════════
s = sec("s7", "7 · Data Quality & Integrity", "Completeness, evidence capture, and outlier/control checks.")

gt_pos = m[m["grand_total_n"] > 0]
miss_wit = gt_pos[gt_pos["witness_names"].apply(miss) | gt_pos["witness_national_id"].apply(miss)]
photo_all = m[["form_photo_page_1", "form_photo_page_2", "form_photo_page_3", "form_photo_page_4"]].apply(
    lambda r: sum(not miss(x) for x in r), axis=1)
add(s, {"type": "kpi", "title": "Completeness & evidence",
        "cards": [{"label": "Missing witness (grand_total>0)", "value": f"{len(miss_wit):,}"},
                  {"label": "All 4 photos", "value": f"{(photo_all==4).mean()*100:.1f}%"},
                  {"label": ">=1 photo", "value": f"{(photo_all>=1).mean()*100:.1f}%"},
                  {"label": "Scanned vs manual ID", "value": f"{(~m['farmer_id'].apply(miss)).sum():,} / {(~m['manual_farmer_id'].apply(miss)).sum():,}"}]})

add(s, {"type": "bar", "title": "Form photos captured per submission",
        "labels": ["0", "1", "2", "3", "4"],
        "values": [int((photo_all == k).sum()) for k in range(5)],
        "horizontal": False, "axisLabel": "submissions"})

# enumerators with high 'other' rates
oth_enum = ve.copy()
oth_enum["is_other"] = (oth_enum["no_farmer_id_reason"].str.strip().str.lower() == "other")
ge = oth_enum.groupby("enum").agg(n=("_id", "size"), others=("is_other", "sum"))
ge = ge[ge["n"] >= 30]
ge["other_rate"] = (ge["others"] / ge["n"] * 100).round(1)
ge = ge.sort_values("other_rate", ascending=False).head(15)
add(s, {"type": "table", "title": "Enumerators with high 'other' no-ID-reason rate (training flag)",
        "columns": ["enumerator", "submissions", "'other' count", "other rate %"],
        "rows": [[i, int(r.n), int(r.others), r.other_rate] for i, r in ge.iterrows()]})

big = it[it["qty"] > 1000].sort_values("qty", ascending=False)
add(s, {"type": "table", "title": "Outlier single-species quantities (fraud/error review)",
        "columns": ["_id", "species", "quantity"],
        "rows": [[int(r["_id"]), r["advance_item"], int(r["qty"])] for _, r in big.head(20).iterrows()],
        "note": f"{int((it['qty']>1000).sum()):,} line-items >1,000; {int(it['implausible'].sum())} are >10,000 (excluded from all totals)"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 8 — Qualitative & Feedback
# ════════════════════════════════════════════════════════════════════════════
s = sec("s8", "8 · Qualitative & Feedback", "Themes in farmer comments and demand for unlisted species.")

if "comments_questions_001" in m.columns:
    cm = m["comments_questions_001"].fillna("").str.strip()
    substantive = cm[~cm.str.lower().isin(NEG_FEEDBACK)]
    words = re.findall(r"[a-zA-Z]{4,}", " ".join(substantive.str.lower()))
    STOP = set("the and for that this have with they will from your you are not but was has would farmer farmers tree trees seedling seedlings them then there their what when which were about more some they".split())
    wf = pd.Series([w for w in words if w not in STOP]).value_counts().head(25)
    add(s, {"type": "bar", "title": "Most frequent keywords in farmer comments",
            "labels": list(wf.index), "values": [int(x) for x in wf.values],
            "horizontal": True, "axisLabel": "mentions", "tall": True,
            "note": f"{len(substantive):,} substantive comments of {len(cm):,} ({len(substantive)/len(cm)*100:.0f}%); rest are 'No'/'N/A'"})

sug = m["suggested_seedlings"].fillna("").str.strip().str.lower()
sug_real = sug[~sug.isin(NEG_FEEDBACK)]
sug_top = sug_real.value_counts().head(25)
add(s, {"type": "table", "title": "Most-requested unlisted species (suggested_seedlings)",
        "columns": ["suggestion", "count"],
        "rows": [[k, int(v)] for k, v in sug_top.items()],
        "note": f"{len(sug_real):,} substantive suggestions"})

# suggestions by region (top suggestions concentration)
sug_df = m.copy(); sug_df["sug"] = sug
sug_reg = (sug_df[~sug_df["sug"].isin(NEG_FEEDBACK)].groupby("region_norm").size().sort_values(ascending=False))
add(s, {"type": "bar", "title": "Volume of new-species suggestions by region",
        "labels": list(sug_reg.index), "values": [int(x) for x in sug_reg.values],
        "horizontal": True, "axisLabel": "suggestions"})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 9 — Executive (interactive)  -> handled specially in JS
# ════════════════════════════════════════════════════════════════════════════
# Region health scorecard (RAG)
health_rows = []
overall_uptake = mc["total_seedlings_n"].mean()
for r, g in mc.groupby("region_norm"):
    subs = len(g)
    uptake = g["total_seedlings_n"].mean()
    cps_r = (g["total_seedlings_cost_n"].sum() / g["total_seedlings_n"].sum()) if g["total_seedlings_n"].sum() else np.nan
    enum_prod = m[(m["region_norm"] == r) & m["enum"].notna()].groupby("enum").size().mean()
    photos = m[m["region_norm"] == r][["form_photo_page_1", "form_photo_page_2", "form_photo_page_3", "form_photo_page_4"]].apply(
        lambda x: sum(not miss(v) for v in x), axis=1)
    dq = (photos == 4).mean() * 100
    health_rows.append({"region": r, "applications": int(subs),
                        "avg_seedlings": round(float(uptake), 1),
                        "cost_per_seedling": round(float(cps_r), 0) if not pd.isna(cps_r) else None,
                        "enum_productivity": round(float(enum_prod), 1) if not pd.isna(enum_prod) else None,
                        "all_photos_pct": round(float(dq), 1)})

# Monthly executive summary
monthly = (mc.dropna(subset=["ym"]).groupby("ym")
           .agg(applications=("_id", "size"), seedlings=("total_seedlings_n", "sum"),
                disbursed=("grand_total_n", "sum")).reset_index().sort_values("ym"))
monthly_rows = [[r.ym, int(r.applications), int(r.seedlings), int(r.disbursed)] for r in monthly.itertuples()]

# Record-level array for client-side filtering (trim to essentials)
rec = mc[["region_norm", "district", "proj", "ym", "total_seedlings_n",
          "grand_total_n", "coop_type", "total_seedlings_cost_n"]].copy()
rec = rec.dropna(subset=["ym"])
records = [[r.region_norm, r.district or "(blank)", r.proj, r.ym,
            int(r.total_seedlings_n) if not pd.isna(r.total_seedlings_n) else 0,
            int(r.grand_total_n) if not pd.isna(r.grand_total_n) else 0, r.coop_type,
            int(r.total_seedlings_cost_n) if not pd.isna(r.total_seedlings_cost_n) else 0]
           for r in rec.itertuples()]

EXEC = {
    "records": records,
    "fields": ["region", "district", "project", "ym", "seedlings", "cost", "coop_type", "seedlings_cost"],
    "regions": sorted(rec["region_norm"].unique().tolist()),
    "projects": sorted(rec["proj"].unique().tolist()),
    "months": sorted(rec["ym"].unique().tolist()),
    "health": health_rows,
    "monthly": monthly_rows,
}

GLOBAL = {
    "N": N, "items": len(it),
    "total_seedlings": int(itc["qty"].sum()),
    "total_cost": int(mc["grand_total_n"].sum()),
    "regions": int(mc["region_norm"].nunique()),
    "districts": int(mc[mc["district"] != ""]["district"].nunique()),
    "enumerators": int(m["enum"].nunique()),
    "date_min": str(mc["date"].dropna().min()), "date_max": str(mc["date"].dropna().max()),
    "excluded": int(it["implausible"].sum()),
}

DATA = to_native({"sections": SECTIONS, "exec": EXEC, "global": GLOBAL})
payload = json.dumps(DATA, separators=(",", ":"))
print(f"  payload size: {len(payload)/1e6:.1f} MB  | records embedded: {len(records):,}")

with open(os.path.join(HERE, "dashboard_template.html"), "r", encoding="utf-8") as f:
    template = f.read()
out_html = template.replace("/*__DATA__*/", payload)
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(out_html)
print(f"  wrote {OUT_HTML}  ({os.path.getsize(OUT_HTML)/1e6:.1f} MB)")
