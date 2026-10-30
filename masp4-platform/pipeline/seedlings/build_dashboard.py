"""Build a single self-contained interactive HTML dashboard for the UG Tree
Seedlings Request dataset (NPL & REAP), covering 7 insight sections plus
Distribution & Fulfilment (application → distribution).

Reads the ug_seed_* tables from Supabase (loaded nightly by load_supabase.py), so
Supabase is the single source of truth: the application↔distribution join and the
served / repeat / legacy flags come from transform.py via the database.

Computation is done in pandas; results are emitted as a JSON blob of typed
"blocks" rendered client-side by generic JS + Chart.js. The Executive section
filters client-side over an embedded record-level array. GPS point
maps are matplotlib PNGs embedded as base64.

Output: <repo>/public/Seedlings_Dashboard.html  (served by Next.js at /Seedlings_Dashboard.html)
"""
import os, io, sys, json, base64, html, re
import httpx
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# All paths derive from this script's location so it runs identically locally and
# in CI. HERE = pipeline/seedlings; REPO_ROOT = the masp4-platform repo root.
HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
from load_supabase import _load_env, select_all  # noqa: E402  (same env + paging helpers)
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


# ── Load from Supabase ────────────────────────────────────────────────────────
# Supabase is the single source of truth (loaded nightly by load_supabase.py);
# columns are renamed back to the Kobo field names the sections below use.
print("Loading from Supabase...")
url, key = _load_env()
with httpx.Client(timeout=180) as c:
    m = pd.DataFrame(select_all(c, url, key, "ug_seed_applications", "*"))
    it = pd.DataFrame(select_all(c, url, key, "ug_seed_application_items",
                                 "application_kobo_id,item_no,species,quantity,other_species_name,line_cost"))
    dev = pd.DataFrame(select_all(c, url, key, "ug_seed_dist_events", "*"))
    den = pd.DataFrame(select_all(c, url, key, "ug_seed_dist_entries", "*"))
if m.empty:
    sys.exit("ug_seed_applications is empty — run fetch → transform → load first")
# PostgREST row order is not guaranteed — sort so identical data gives an identical file
m = m.sort_values("kobo_id").reset_index(drop=True)
it = it.sort_values(["application_kobo_id", "item_no"]).reset_index(drop=True)
m = m.rename(columns={"kobo_id": "_id", "submitted_at": "_submission_time",
                      "started_at": "application_start", "ended_at": "application_end",
                      "already_applied": "farmer__already_applied", "comments": "comments_questions_001"})
it = it.rename(columns={"application_kobo_id": "_id", "species": "advance_item"})
txt = ["region", "district", "cooperative", "project", "have_farmer_id", "farmer_id", "manual_farmer_id",
       "no_farmer_id_reason", "farmer__already_applied", "enumerator_name", "suggested_seedlings",
       "comments_questions_001", "witness_date"]
m[txt] = m[txt].fillna("").astype(str)
# later form versions capitalise district codes ('Lira' vs 'lira') — fold them
m["district"] = m["district"].str.strip().str.lower()
it[["advance_item", "other_species_name"]] = it[["advance_item", "other_species_name"]].fillna("").astype(str)
N = len(m)

num = lambda s: pd.to_numeric(s, errors="coerce")
for c in ["total_seedlings", "total_seedlings_cost", "facilitation_cost",
          "transport_cost", "grand_total"]:
    m[c + "_n"] = num(m[c])
# Fold version-coded species variants — e.g. 'avocado __central' -> 'avocado',
# 'albizia_gummifera__central' -> 'albizia_gummifera' — the species analogue of
# REGION_FIX. Keeps charts clean while still letting genuinely new species appear.
it["advance_item"] = it["advance_item"].map(
    lambda s: re.sub(r"\s*__\w+$", "", str(s).strip().lower()).strip())
it["qty"] = num(it["quantity"])
it["line_cost"] = num(it["line_cost"])
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

# GPS
m["lat"] = num(m["lat"]); m["lon"] = num(m["lon"])
m["in_ug"] = m["lat"].between(*UG_LAT) & m["lon"].between(*UG_LON)

# enumerator identity (resolved select-list / typed name, from transform.py)
m["enum"] = m["enumerator_name"].where(~m["enumerator_name"].apply(miss), np.nan)

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
# SECTION 0 — Distribution & Fulfilment (application → distribution form)
# ════════════════════════════════════════════════════════════════════════════
# Fulfilment is measured on ALL applications. There were no distributions for the
# 2023–24 application rounds, so those count as not served; DIST_ERA only splits them
# out in the by-year view. "Awaiting" includes applications not (yet) approved —
# approval happens outside Kobo.
DIST_ERA = pd.Timestamp("2025-01-01", tz="UTC")
m["served"] = m["is_distributed"].fillna(False).astype(bool)
m["given_n"] = num(m["seedlings_given"])
m["days_n"] = num(m["days_to_distribution"])
m["dist_dt"] = pd.to_datetime(m["first_distributed_at"], errors="coerce", utc=True)
m["era"] = m["sub_dt"] >= DIST_ERA
mc = m[~m["impl"]].copy()              # re-derive so the cleaned main carries the delivery columns
era = m.copy()                         # all applications (2023–24 included, unserved)
era["seed_clean"] = era["total_seedlings_n"].where(~era["impl"])   # implausible (>10k) excluded, as elsewhere
NOW = pd.Timestamp.now(tz="UTC").floor("D")
era["age_days"] = (NOW - era["sub_dt"]).dt.days
wait = era[~era["served"]]

dev["is_test"] = dev["is_test"].fillna(False).astype(bool)
dev["ev_dt"] = pd.to_datetime(dev["started_at"].fillna(dev["submitted_at"]), errors="coerce", utc=True)
ev_test = set(dev.loc[dev["is_test"], "kobo_id"])
den["real"] = ~den["event_kobo_id"].isin(ev_test)
for c in ["matched", "is_legacy", "is_repeat"]:
    den[c] = den[c].fillna(False).astype(bool)
dreal = den[den["real"]]
evr = dev[~dev["is_test"] & dev["kobo_id"].isin(set(dreal.loc[~dreal["is_legacy"], "event_kobo_id"]))]

n_era, n_srv = len(era), int(era["served"].sum())
FULFIL = n_srv / n_era * 100 if n_era else 0
DELIVERED = int(m["given_n"].sum())
MED_DAYS = float(era["days_n"].median()) if era["days_n"].notna().any() else None
n_era_only, n_srv_era = int(m["era"].sum()), int(m.loc[m["era"], "served"].sum())
FULFIL_ERA = n_srv_era / n_era_only * 100 if n_era_only else 0

s = sec("s0", "0 · Distribution & Fulfilment",
        "What farmers received, joined from the Distribution form to each application. "
        "Fulfilment = share of all applications (2023 onwards) with a recorded delivery.")

add(s, {"type": "kpi", "title": "Applications → distribution (all applications)",
        "cards": [{"label": "Applications (all)", "value": f"{n_era:,}"},
                  {"label": "Served (seedlings delivered)", "value": f"{n_srv:,}"},
                  {"label": "Fulfilment rate", "value": f"{FULFIL:.1f}%"},
                  {"label": "Awaiting / not approved", "value": f"{len(wait):,}"},
                  {"label": "Seedlings delivered", "value": f"{DELIVERED:,}"},
                  {"label": "Median days: application → delivery",
                   "value": f"{MED_DAYS:.0f}" if MED_DAYS is not None else "–"},
                  {"label": "Distribution events", "value": f"{len(evr):,}"},
                  {"label": "Avg farmers per event",
                   "value": f"{(dreal['is_legacy'] == False).sum() / len(evr):.1f}" if len(evr) else "–"}],
        "note": "Seedlings delivered counts each application's first delivery only (repeat entries excluded). "
                "The form requires seedlings given = seedlings applied for, so fulfilment is per application, "
                "not per seedling."})

add(s, {"type": "note", "title": "Scope",
        "text": f"Fulfilment covers all applications. The <b>{int((~m['era']).sum()):,}</b> applications from "
                f"2023–24 are included and count as not served — no distributions took place for those rounds. "
                f"Applications from 2025 onwards alone: <b>{FULFIL_ERA:.1f}%</b> served "
                f"({n_srv_era:,} of {n_era_only:,}). <b>Awaiting</b> mixes applications not yet "
                "delivered with ones that were not approved — the approved list is kept outside Kobo."})

yr = (era.dropna(subset=["sub_dt"]).groupby(era["sub_dt"].dt.year)
      .agg(n=("_id", "size"), served=("served", "sum")).sort_index())
add(s, {"type": "stacked", "title": "Served vs awaiting, by application year",
        "labels": [str(int(y)) for y in yr.index],
        "series": [{"label": "served", "data": [int(x) for x in yr["served"]]},
                   {"label": "awaiting / not approved", "data": [int(x) for x in yr["n"] - yr["served"]]}],
        "note": " · ".join(f"{int(y)}: {r.served / r.n * 100:.1f}% served" for y, r in yr.iterrows())
                + " — no distributions took place for the 2023–24 rounds"})

reg_f = (era.groupby("region_norm").agg(served=("served", "sum"), n=("_id", "size"))
         .sort_values("n", ascending=False))
add(s, {"type": "stacked", "title": "Served vs awaiting, by region (all applications)",
        "labels": list(reg_f.index),
        "series": [{"label": "served", "data": [int(x) for x in reg_f["served"]]},
                   {"label": "awaiting / not approved", "data": [int(x) for x in reg_f["n"] - reg_f["served"]]}]})

dist_f = (era[era["district"] != ""].groupby("district")
          .agg(served=("served", "sum"), n=("_id", "size")).query("n >= 30"))
dist_f["pct"] = dist_f["served"] / dist_f["n"] * 100
dist_f = dist_f.sort_values("pct", ascending=False)
add(s, {"type": "bar", "title": f"Fulfilment rate by district (% of all applications served, {len(dist_f)} districts)",
        "labels": list(dist_f.index), "values": [round(float(x), 1) for x in dist_f["pct"]],
        "horizontal": True, "axisLabel": "% served", "tall": True,
        "note": "districts with at least 30 applications"})

coh = (era.dropna(subset=["ym"]).groupby("ym").agg(n=("_id", "size"), served=("served", "sum")).sort_index())
add(s, {"type": "line", "title": "Applications vs served, by application month",
        "labels": list(coh.index),
        "series": [{"label": "applications", "data": [int(x) for x in coh["n"]]},
                   {"label": "served", "data": [int(x) for x in coh["served"]]}],
        "note": "recent months are naturally lower: delivery follows application by weeks to months"})

ap_m = era.dropna(subset=["ym"]).groupby("ym")["seed_clean"].sum()
dl_m = m.dropna(subset=["dist_dt"]).groupby(m["dist_dt"].dt.strftime("%Y-%m"))["given_n"].sum()
months = sorted(set(ap_m.index) | set(dl_m.index))
add(s, {"type": "line", "title": "Cumulative seedlings: applied for vs delivered",
        "labels": months,
        "series": [{"label": "applied for", "data": [int(x) for x in ap_m.reindex(months, fill_value=0).cumsum()]},
                   {"label": "delivered", "data": [int(x) for x in dl_m.reindex(months, fill_value=0).cumsum()]}],
        "note": "applied for by application month; delivered by distribution month"})

ev_m = evr.dropna(subset=["ev_dt"]).groupby(evr["ev_dt"].dt.strftime("%Y-%m")).size()
add(s, {"type": "bar", "title": "Distribution events per month",
        "labels": list(ev_m.index), "values": [int(x) for x in ev_m.values],
        "horizontal": False, "axisLabel": "events"})

srv_ids = set(era.loc[era["served"], "_id"])
era_ids = set(era["_id"])
sp = itc[itc["_id"].isin(era_ids) & itc["advance_item"].isin(SPECIES_DYN)].copy()
sp["status"] = np.where(sp["_id"].isin(srv_ids), "served", "awaiting")
sp_s = sp.pivot_table(index="advance_item", columns="status", values="qty", aggfunc="sum", fill_value=0)
sp_s = sp_s.reindex(columns=["served", "awaiting"], fill_value=0)
sp_s = sp_s.loc[sp_s.sum(axis=1).sort_values(ascending=False).index]
add(s, {"type": "stacked", "title": "Species in served vs awaiting applications (seedlings)",
        "labels": list(sp_s.index),
        "series": [{"label": c, "data": [int(x) for x in sp_s[c]]} for c in sp_s.columns],
        "note": "estimated from the species applied for — the Distribution form records totals only, not species"})

fig, ax = plt.subplots(figsize=(7, 7))
ap_pts = era[era["in_ug"]]
ax.scatter(ap_pts["lon"], ap_pts["lat"], s=2, alpha=0.15, color="#888888", label="application")
ev_pts = evr[pd.to_numeric(evr["lat"], errors="coerce").between(*UG_LAT)
             & pd.to_numeric(evr["lon"], errors="coerce").between(*UG_LON)]
ax.scatter(pd.to_numeric(ev_pts["lon"]), pd.to_numeric(ev_pts["lat"]), s=6, alpha=0.5,
           color="#e65100", label="distribution event")
ax.set_title("Applications and distribution events"); ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude")
ax.legend(markerscale=4, fontsize=8, loc="upper right"); ax.grid(alpha=0.3)
add(s, {"type": "image", "title": "Where seedlings were requested vs delivered (GPS)", "src": b64fig(fig)})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Regional & Geographic
# ════════════════════════════════════════════════════════════════════════════
s = sec("s1", "1 · Regional & Geographic", "Where farmers, seedlings and spend concentrate. Interactive district choropleth (GeoJSON boundaries) plus ranked bars and real-GPS point maps.")

add(s, vc_block(m["region_norm"], "Farmers (applications) by region", horizontal=True,
                axis="applications", note="south_western folds in southern_western (version coding)"))

ds = era[era["district"] != ""].assign(
    delivered=era["given_n"].where(era["served"], 0).fillna(0),
    awaiting=era["seed_clean"].where(~era["served"], 0).fillna(0))
dist_seed = ds.groupby("district")[["delivered", "awaiting"]].sum()
dist_seed = dist_seed.loc[dist_seed.sum(axis=1).sort_values(ascending=False).index]
add(s, {"type": "stacked", "title": f"Seedlings by district: delivered vs awaiting (all {len(dist_seed)})",
        "labels": list(dist_seed.index),
        "series": [{"label": "delivered", "data": [int(x) for x in dist_seed["delivered"]]},
                   {"label": "awaiting / not approved", "data": [int(x) for x in dist_seed["awaiting"]]}],
        "horizontal": True, "tall": True,
        "note": "bar length = seedlings applied for; delivered from the Distribution form"})

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
era_d = era.assign(dkey=era["district"].map(norm_dist))
fm = era_d[era_d["dkey"] != ""].groupby("dkey").agg(n=("_id", "size"), served=("served", "sum"))
metric_lookup = {k: {"applications": int(r.applications),
                     "seedlings": int(r.seedlings) if not pd.isna(r.seedlings) else 0,
                     "disbursed": int(r.disbursed) if not pd.isna(r.disbursed) else 0,
                     "served": int(fm.loc[k, "served"]) if k in fm.index else 0,
                     "fulfilment": round(float(fm.loc[k, "served"] / fm.loc[k, "n"] * 100), 1)
                                   if k in fm.index else None}
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
        "title": "District choropleth — applications · seedlings · disbursement · fulfilment",
        "geojson": geo,
        "metrics": [{"key": "applications", "label": "Applications"},
                    {"key": "seedlings", "label": "Seedlings"},
                    {"key": "disbursed", "label": "Disbursed (UGX)"},
                    {"key": "served", "label": "Applications served"},
                    {"key": "fulfilment", "label": "Fulfilment % (all applications)"}],
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

add(s, {"type": "note", "title": "Not computable",
        "text": "Participation relative to <b>registered</b> cooperatives per district (uganda_cooperatives) needs an external cooperative registry that is not in the submission data."})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Time Trends
# ════════════════════════════════════════════════════════════════════════════
s = sec("s2", "2 · Time Trends", "Application rollout over time, by region and project.")

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

# ════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Seedling Varieties
# ════════════════════════════════════════════════════════════════════════════
s = sec("s3", "3 · Seedling Varieties", "Species demand, mix by geography, and unlisted-species requests.")

spq = itc.assign(status=np.where(itc["_id"].isin(srv_ids), "delivered", "awaiting / not approved"))
spq = spq.pivot_table(index="advance_item", columns="status", values="qty", aggfunc="sum", fill_value=0)
spq = spq.reindex(columns=["delivered", "awaiting / not approved"], fill_value=0)
spq = spq.loc[spq.sum(axis=1).sort_values(ascending=False).index]
add(s, {"type": "stacked", "title": "Species ranked by total seedlings requested: delivered vs awaiting",
        "labels": list(spq.index),
        "series": [{"label": c, "data": [int(x) for x in spq[c]]} for c in spq.columns],
        "horizontal": True, "tall": True,
        "note": "delivered = species on applications that were served — the Distribution form records totals only, not species"})

sp_reg = (itc[itc["advance_item"].isin(SPECIES_DYN)]
          .pivot_table(index="region_norm", columns="advance_item", values="qty", aggfunc="sum", fill_value=0))
add(s, {"type": "stacked", "title": "Species mix by region (stacked seedlings)",
        "labels": list(sp_reg.index),
        "series": [{"label": c, "data": [int(x) for x in sp_reg[c]]} for c in sp_reg.columns if c in sp_reg]})

oth = itc[itc["other_species_name"].str.strip() != ""]["other_species_name"].str.strip().str.lower()
oth_top = oth.value_counts().head(25)
add(s, {"type": "table", "title": "Most-requested unlisted species (other_species_name)",
        "columns": ["species (free text)", "requests"],
        "rows": [[k, int(v)] for k, v in oth_top.items()],
        "note": f"{(itc['advance_item']=='others').sum():,} 'others' line-items; {oth.nunique():,} distinct free-text names"})

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
# SECTION 5 — Farmer & Cooperative Profiles
# ════════════════════════════════════════════════════════════════════════════
s = sec("s6", "5 · Farmer & Cooperative Profiles", "Cooperative vs individual uptake, ID coverage, project mix.")

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

nid = m["has_national_id"].fillna(False).astype(bool)
add(s, {"type": "kpi", "title": "National ID verification coverage",
        "cards": [{"label": "Has national ID", "value": f"{nid.mean()*100:.1f}%"},
                  {"label": "Missing / placeholder", "value": f"{(~nid).mean()*100:.1f}%"},
                  {"label": "Records with ID", "value": f"{int(nid.sum()):,}"}]})

px = m[m["proj"] != "unknown"].pivot_table(index="region_norm", columns="proj", values="_id", aggfunc="size", fill_value=0)
add(s, {"type": "stacked", "title": "Project × region (where project recorded)",
        "labels": list(px.index),
        "series": [{"label": c, "data": [int(x) for x in px[c]]} for c in px.columns]})

# ════════════════════════════════════════════════════════════════════════════
# SECTION 6 — Data Quality & Process Integrity
# ════════════════════════════════════════════════════════════════════════════
s = sec("s7", "6 · Data Quality & Integrity", "Completeness, evidence capture, and outlier/control checks.")

gt_pos = m[m["grand_total_n"] > 0]
miss_wit = gt_pos[~gt_pos["has_witness"].fillna(False).astype(bool)]
photo_all = m["n_form_photos"].fillna(0).astype(int)
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
oth_enum = m[m["enum"].notna()].copy()
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
# SECTION 7 — Qualitative & Feedback
# ════════════════════════════════════════════════════════════════════════════
s = sec("s8", "7 · Qualitative & Feedback", "Themes in farmer comments and demand for unlisted species.")

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
# SECTION 8 — Executive (interactive)  -> handled specially in JS
# ════════════════════════════════════════════════════════════════════════════
# Region health scorecard (RAG)
health_rows = []
overall_uptake = mc["total_seedlings_n"].mean()
for r, g in mc.groupby("region_norm"):
    subs = len(g)
    uptake = g["total_seedlings_n"].mean()
    cps_r = (g["total_seedlings_cost_n"].sum() / g["total_seedlings_n"].sum()) if g["total_seedlings_n"].sum() else np.nan
    enum_prod = m[(m["region_norm"] == r) & m["enum"].notna()].groupby("enum").size().mean()
    photos = m.loc[m["region_norm"] == r, "n_form_photos"].fillna(0)
    dq = (photos == 4).mean() * 100
    ge_r = era[era["region_norm"] == r]
    health_rows.append({"region": r, "applications": int(subs),
                        "fulfil_pct": round(float(ge_r["served"].mean() * 100), 1) if len(ge_r) else None,
                        "avg_seedlings": round(float(uptake), 1),
                        "cost_per_seedling": round(float(cps_r), 0) if not pd.isna(cps_r) else None,
                        "enum_productivity": round(float(enum_prod), 1) if not pd.isna(enum_prod) else None,
                        "all_photos_pct": round(float(dq), 1)})

# Monthly executive summary
monthly = (mc.dropna(subset=["ym"]).groupby("ym")
           .agg(applications=("_id", "size"), seedlings=("total_seedlings_n", "sum"),
                disbursed=("grand_total_n", "sum"), served=("served", "sum"),
                given=("given_n", "sum")).reset_index().sort_values("ym"))
monthly_rows = [[r.ym, int(r.applications), int(r.seedlings), int(r.disbursed), int(r.served), int(r.given)]
                for r in monthly.itertuples()]

# Record-level array for client-side filtering (trim to essentials)
rec = mc[["region_norm", "district", "proj", "ym", "total_seedlings_n",
          "grand_total_n", "coop_type", "total_seedlings_cost_n", "served", "given_n", "dist_dt"]].copy()
rec = rec.dropna(subset=["ym"])
records = [[r.region_norm, r.district or "(blank)", r.proj, r.ym,
            int(r.total_seedlings_n) if not pd.isna(r.total_seedlings_n) else 0,
            int(r.grand_total_n) if not pd.isna(r.grand_total_n) else 0, r.coop_type,
            int(r.total_seedlings_cost_n) if not pd.isna(r.total_seedlings_cost_n) else 0,
            int(r.served), int(r.given_n) if not pd.isna(r.given_n) else 0,
            r.dist_dt.strftime("%Y-%m") if not pd.isna(r.dist_dt) else ""]
           for r in rec.itertuples()]

EXEC = {
    "records": records,
    "fields": ["region", "district", "project", "ym", "seedlings", "cost", "coop_type", "seedlings_cost",
               "served", "given", "dym"],
    "dist_era": "0000-00",           # fulfilment counts all applications
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
    "served": n_srv, "fulfil_pct": round(FULFIL, 1), "delivered": DELIVERED,
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
