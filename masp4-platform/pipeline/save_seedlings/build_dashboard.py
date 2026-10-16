"""Build a single self-contained interactive HTML dashboard for the SAVE KE
Seedlings Distribution form (Nyandarua, Kenya).

Reads the save_dist_* tables from Supabase (loaded nightly by load_supabase.py),
so Supabase is the single source of truth: rounds, duplicate and first-receipt
flags come from transform.py via the database, not recomputed here.

Computation is done in pandas; results are emitted as a JSON blob of typed
"blocks" rendered client-side by generic JS + Chart.js (same block contract as
pipeline/seedlings). The Summary section filters client-side over an embedded
farmer-entry array. Distribution points are drawn on a Leaflet map.

PII policy: Beneficiary IDs are replaced by integer indices before embedding;
enumerators are shown as pseudonymous codes (E01, E02 ...); free-text comments
are reduced to keyword counts. Farmer names / phones are never stored upstream.

Output: <repo>/public/SAVE_KE_Seedlings_Dashboard.html
"""
import os, sys, json, re
import httpx
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_HTML = os.environ.get("SAVE_OUT",
                          os.path.join(REPO_ROOT, "public", "SAVE_KE_Seedlings_Dashboard.html"))
os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)
sys.path.insert(0, HERE)
from load_supabase import _load_env, select_all  # noqa: E402  (same env + paging helpers)

SPECIES = {  # table column -> display name, indicative use group
    "calliandra": ("Calliandra calothyrsus", "Fodder / N-fixing"),
    "sesbania": ("Sesbania sesban", "Fodder / N-fixing"),
    "dombeya": ("Dombeya torrida (Mukeu)", "Indigenous / timber"),
    "grevillea": ("Grevillea robusta", "Indigenous / timber"),
    "avocado": ("Avocado", "Fruit"),
    "cordia": ("Cordia africana", "Indigenous / timber"),
    "azadirachta": ("Azadirachta indica (Murobaine)", "Indigenous / timber"),
    "apple": ("Apple", "Fruit"),
    "bamboo": ("Giant bamboo", "Indigenous / timber"),
}
DUP_WINDOW_DAYS = 7          # must match transform.py (label text only)
ROUND_GAP_DAYS = 21          # must match transform.py (label text only)
NEG_FEEDBACK = {"", "no", "none", "non", "nil", "n/a", "na", "no comment", "nothing", "0", "."}


def to_native(o):
    if isinstance(o, dict):
        return {k: to_native(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [to_native(v) for v in o]
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if (pd.isna(o) or np.isinf(o)) else round(float(o), 4)
    return o


# ── Load from Supabase ────────────────────────────────────────────────────────
print("Loading from Supabase...")
url, key = _load_env()
with httpx.Client(timeout=120) as c:
    m = pd.DataFrame(select_all(c, url, key, "save_dist_events", "*"))
    f = pd.DataFrame(select_all(c, url, key, "save_dist_farmer_entries", "*"))
    pf = pd.DataFrame(select_all(c, url, key, "save_dist_profiled_farmers",
                                 "beneficiary_id,gender,age_group,sub_county,ward,in_project_area,"
                                 "approved_plots,source_sheet"))
    meta = select_all(c, url, key, "save_dist_sync_meta", "profiled_synced_at,framework_synced_at")
    mf = pd.DataFrame(select_all(c, url, key, "save_mf_indicator_values", "*"))
if m.empty:
    sys.exit("save_dist_events is empty — run fetch → transform → load first")
# PostgREST row order is not guaranteed — sort so identical data gives an identical file
m = m.sort_values("kobo_id").reset_index(drop=True)
f = f.sort_values(["event_kobo_id", "entry_no"]).reset_index(drop=True)
num = lambda s: pd.to_numeric(s, errors="coerce")

N_ALL = len(m)
n_test = int(m["is_test"].sum())
m = m[~m["is_test"]].copy()

m["_id"] = m["kobo_id"]
m["start_dt"] = pd.to_datetime(m["started_at"], errors="coerce", utc=True)
m["end_dt"] = pd.to_datetime(m["ended_at"], errors="coerce", utc=True)
m["date"] = m["start_dt"].dt.date
m["ym"] = m["start_dt"].dt.strftime("%Y-%m")
m["dur_min"] = (m["end_dt"] - m["start_dt"]).dt.total_seconds() / 60
m["subcounty"] = m["sub_county"].fillna("(blank)")
m["ward"] = m["ward"].fillna("(blank)")
m["village"] = m["village"].fillna("(blank)")
m["lat"] = num(m["lat"]); m["lon"] = num(m["lon"])
m["in_area"] = m["gps_in_area"].fillna(False).astype(bool)
m["comments"] = m["comments"].fillna("")
rl = m.dropna(subset=["round_no"]).drop_duplicates("round_no").sort_values("round_no")
ROUNDS = rl["round_label"].tolist()
m["round"] = m["round_label"].fillna("(no date)")

# Enumerators -> pseudonymous codes, ranked by submissions (stable within a build)
en = m["enumerator"].fillna("").str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
en = en.where(en != "", np.nan)
codes = {n: f"E{i+1:02d}" for i, n in enumerate(en.value_counts().index)}
m["enum"] = en.map(codes)

# Farmer entries
x = f.rename(columns={"event_kobo_id": "_id"}).merge(
    m[["_id", "subcounty", "ward", "village", "round", "round_no", "ym", "start_dt", "enum"]], on="_id", how="inner")
x["qty"] = num(x["total_seedlings"])
for k in SPECIES:
    x[k] = num(x[k]).fillna(0)
x["sum_ok"] = x["species_sum_ok"].fillna(True).astype(bool)
x["given_flag"] = x["already_received"].fillna("")
x["fid"] = x["beneficiary_id"].fillna("")
x["coop_key"] = (x["cooperative"].fillna("").str.lower().str.replace(r"[^a-z0-9 ]", "", regex=True)
                 .str.replace(r"\s+", " ", regex=True).str.strip())
x.loc[x["coop_key"].isin(["", "not provided", "none", "na", "n a"]), "coop_key"] = "(not provided)"
x = x.sort_values(["start_dt", "_id", "entry_no"], kind="stable")
x["dup"] = x["is_probable_dup"].fillna(False).astype(bool)
x["first_time"] = x["is_first_receipt"].fillna(False).astype(bool)
x["received"] = x["qty"].fillna(0) > 0

R = x[x["received"]]                    # entries where seedlings were handed out
RD = R[~R["dup"]]                       # de-duplicated view for reach counts
print(f"  events={len(m):,} entries={len(x):,} received={len(R):,} unique farmers={R['fid'].nunique():,}")
print(f"  rounds: {len(ROUNDS)}")

SECTIONS = []


def sec(id, title, desc=""):
    s = {"id": id, "title": title, "desc": desc, "blocks": []}
    SECTIONS.append(s)
    return s


def add(s, block):
    s["blocks"].append(block)


def bar(title, ser, axis, horizontal=True, note="", tall=False, rnd=0):
    return {"type": "bar", "title": title, "labels": [str(i) for i in ser.index],
            "values": [round(float(v), rnd) if rnd else int(v) for v in ser.values],
            "horizontal": horizontal, "axisLabel": axis, "note": note, "tall": tall}


def stacked(title, piv, note=""):
    return {"type": "stacked", "title": title, "labels": [str(i) for i in piv.index],
            "series": [{"label": str(c), "data": [int(v) for v in piv[c]]} for c in piv.columns], "note": note}


SP_KEYS = list(SPECIES)
SP_NAMES = {k: v[0] for k, v in SPECIES.items()}

# ════════════════════════════════════════════════════════════════════════════
# 1 · Reach & Geography
# ════════════════════════════════════════════════════════════════════════════
s = sec("s1", "1 · Reach & Geography",
        "Where seedlings went: sub-county, ward and village reach, plus the GPS location of every distribution event.")
geo = (R.groupby(["subcounty", "ward"]).agg(entries=("fid", "size"), farmers=("fid", "nunique"),
                                             seedlings=("qty", "sum"), villages=("village", "nunique"))
       .reset_index().sort_values("seedlings", ascending=False))
geo["per_farmer"] = (geo["seedlings"] / geo["farmers"]).round(1)
add(s, {"type": "table", "title": "Reach by ward",
        "columns": ["sub-county", "ward", "farmer entries", "unique farmers", "seedlings", "villages", "seedlings / farmer"],
        "rows": [[r.subcounty, r.ward, int(r.entries), int(r.farmers), int(r.seedlings), int(r.villages), r.per_farmer]
                 for r in geo.itertuples()]})
add(s, bar("Unique farmers reached by ward", R.groupby("ward")["fid"].nunique().sort_values(ascending=False),
           "farmers", horizontal=False))
add(s, bar("Seedlings distributed by ward", R.groupby("ward")["qty"].sum().sort_values(ascending=False),
           "seedlings", horizontal=False))
vil = R.groupby("village")["fid"].nunique().sort_values(ascending=False)
add(s, bar(f"Top 25 villages by farmers reached (of {len(vil)})", vil.head(25), "farmers", tall=True,
           note="Village names are typed by enumerators; minor spelling variants may split a village."))

pts = m[m["in_area"]]
add(s, {"type": "pointmap", "title": "Distribution events (GPS) — size = farmers served",
        "points": [[round(r.lat, 5), round(r.lon, 5), r.ward, int(r.n_farmers), r.round]
                   for r in pts.assign(n_farmers=num(pts["n_farmers"]).fillna(0)).itertuples()],
        "groups": sorted(pts["ward"].unique().tolist()),
        "note": f"{len(pts):,} of {len(m):,} events mapped; {int((~m['in_area']).sum())} with GPS outside Nyandarua are excluded. "
                "Points mark where the distribution took place, not farm locations."})
hm = R.groupby("ward")[SP_KEYS].sum()
hm = hm[[k for k in hm.sum().sort_values(ascending=False).index]]
add(s, {"type": "heatmap", "title": "Ward × species — seedlings distributed",
        "ylabels": list(hm.index), "xlabels": [SP_NAMES[k] for k in hm.columns],
        "matrix": [[int(v) for v in row] for row in hm.values]})

# ════════════════════════════════════════════════════════════════════════════
# 2 · Distribution Rounds & Trends
# ════════════════════════════════════════════════════════════════════════════
s = sec("s2", "2 · Distribution Rounds & Trends",
        f"Rounds are detected automatically: a pause of more than {ROUND_GAP_DAYS} days between events starts a new round.")
rt = []
for r in ROUNDS:
    g = R[R["round"] == r]; ev_r = m[m["round"] == r]
    rt.append([r, str(ev_r["date"].min()), str(ev_r["date"].max()), len(ev_r), len(g),
               int(g["fid"].nunique()), int(g["first_time"].sum()), int(g["qty"].sum()),
               round(float(g["qty"].sum() / g["fid"].nunique()), 1) if len(g) else 0])
add(s, {"type": "table", "title": "Distribution rounds",
        "columns": ["round", "first event", "last event", "events", "farmer entries", "unique farmers",
                    "first-time farmers", "seedlings", "seedlings / farmer"], "rows": rt})
cum = R.groupby(R["start_dt"].dt.date)["qty"].sum().sort_index().cumsum()
add(s, {"type": "line", "title": "Cumulative seedlings distributed",
        "labels": [str(d) for d in cum.index], "series": [{"label": "cumulative seedlings", "data": [int(v) for v in cum.values]}]})
nr = R.groupby("round").agg(new=("first_time", "sum"), total=("fid", "nunique")).reindex(ROUNDS)
nr["returning"] = nr["total"] - nr["new"]
add(s, stacked("New vs returning farmers per round", nr[["new", "returning"]],
               note="'Returning' = farmer already received seedlings in an earlier round."))
rounds_per = R.groupby("fid")["round"].nunique().value_counts().sort_index()
add(s, bar("Farmers by number of rounds they received seedlings in", rounds_per.rename(lambda i: f"{i} round{'s' if i > 1 else ''}"),
           "farmers", horizontal=False))
mon = R.groupby("ym")["qty"].sum().sort_index()
add(s, bar("Seedlings by month", mon, "seedlings", horizontal=False))

# ════════════════════════════════════════════════════════════════════════════
# 3 · Species
# ════════════════════════════════════════════════════════════════════════════
s = sec("s3", "3 · Species", "Which species were distributed, how the mix varies by ward and round, and the use-group balance.")
spt = R[SP_KEYS].sum().sort_values(ascending=False)
add(s, bar("Seedlings by species", spt.rename(SP_NAMES), "seedlings"))
grp = pd.Series({k: SPECIES[k][1] for k in SP_KEYS})
gs = spt.groupby(grp).sum().sort_values(ascending=False)
add(s, {"type": "kpi", "title": "Use-group balance (indicative grouping)",
        "cards": [{"label": f"{g} — {v/gs.sum()*100:.0f}%", "value": f"{int(v):,}"} for g, v in gs.items()],
        "note": "Grouping is indicative, for portfolio balance only (fodder/N-fixing: Calliandra, Sesbania; fruit: Avocado, Apple; others indigenous/timber)."})
sr = R.groupby("round")[SP_KEYS].sum().reindex(ROUNDS).fillna(0)
sr = sr[list(spt.index)].rename(columns=SP_NAMES)
add(s, stacked("Species mix by round", sr))
sw = R.groupby("ward")[list(spt.index)].sum().rename(columns=SP_NAMES)
add(s, stacked("Species mix by ward", sw))
reach_sp = (R[SP_KEYS] > 0).sum().reindex(spt.index).rename(SP_NAMES)
add(s, bar("Farmer entries receiving each species", reach_sp, "entries"))
nsp = (R[SP_KEYS] > 0).sum(axis=1).value_counts().sort_index()
add(s, bar("Species per farmer entry (diversity)", nsp.rename(lambda i: f"{i} species"), "entries", horizontal=False))

# ════════════════════════════════════════════════════════════════════════════
# 4 · Farmer Groups
# ════════════════════════════════════════════════════════════════════════════
s = sec("s4", "4 · Farmer Groups", "Cooperatives / self-help groups taken from the approved farmer register attached to the form.")
cg = (RD[RD["coop_key"] != "(not provided)"].groupby("coop_key")
      .agg(farmers=("fid", "nunique"), seedlings=("qty", "sum")).sort_values("farmers", ascending=False))
np_share = (RD.drop_duplicates("fid")["coop_key"] == "(not provided)").mean() * 100
add(s, {"type": "kpi", "title": "Group membership",
        "cards": [{"label": "Distinct groups", "value": f"{len(cg):,}"},
                  {"label": "Farmers with no group recorded", "value": f"{np_share:.0f}%"},
                  {"label": "Median farmers per group", "value": f"{cg['farmers'].median():.0f}" if len(cg) else "–"}]})
top = cg.head(25)
add(s, bar("Top 25 groups by farmers reached", top["farmers"].rename(lambda k: k.title()), "farmers", tall=True,
           note="Names are normalised for case/punctuation; spelling variants of the same group may still appear separately."))
add(s, {"type": "table", "title": "Top groups — farmers vs seedlings",
        "columns": ["group", "farmers", "seedlings", "seedlings / farmer"],
        "rows": [[k.title(), int(r.farmers), int(r.seedlings), round(r.seedlings / r.farmers, 1)] for k, r in top.iterrows()]})

# ════════════════════════════════════════════════════════════════════════════
# 5 · Operations
# ════════════════════════════════════════════════════════════════════════════
s = sec("s5", "5 · Operations", "Event size, enumerator workload and form timing. Enumerators are shown as codes, not names.")
nf = num(m["n_farmers"]).fillna(0)
bins = [-1, 0, 1, 5, 10, 20, 40, 1000]
labs = ["0", "1", "2–5", "6–10", "11–20", "21–40", "41+"]
add(s, bar("Farmers recorded per distribution event", pd.cut(nf, bins, labels=labs).value_counts().reindex(labs),
           "events", horizontal=False, note=f"median {nf.median():.0f} farmers per event; max {int(nf.max())}"))
ew = (x.groupby("enum").agg(events=("_id", "nunique"), entries=("fid", "size"))
      .sort_values("entries", ascending=False))
add(s, bar("Farmer entries per enumerator (top 25)", ew["entries"].head(25), "entries", tall=True,
           note=f"{len(ew)} enumerators in total. Codes are assigned by volume at each build and are not stable over time."))
d = m["dur_min"]
dbins = [0, 5, 15, 30, 60, 180, 1440, 1e9]
dlabs = ["<5 min", "5–15", "15–30", "30–60", "1–3 h", "3–24 h", ">1 day"]
add(s, bar("Form open time (start → end)", pd.cut(d, dbins, labels=dlabs).value_counts().reindex(dlabs),
           "events", horizontal=False,
           note="Long open times usually mean the form was kept open while serving many farmers, or saved and finalised later."))
wd = m["start_dt"].dt.day_name().value_counts().reindex(
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).fillna(0)
add(s, bar("Events by weekday", wd, "events", horizontal=False))

# ════════════════════════════════════════════════════════════════════════════
# 6 · Data Quality
# ════════════════════════════════════════════════════════════════════════════
s = sec("s6", "6 · Data Quality", "Checks that protect the headline numbers. Totals elsewhere use every recorded entry; the duplicate impact is shown here.")
dups = R[R["dup"]]
blocked = x[x["given_flag"] == "yes"]
noflag = x[x["given_flag"] == ""]
outside = m[~m["in_area"]]
sum_ok = x["sum_ok"] | x["qty"].isna()
range_ok = x["qty"].between(5, 50) | x["qty"].isna()
add(s, {"type": "kpi", "title": "Data-quality checks",
        "cards": [{"label": f"Probable duplicate entries (same farmer within {DUP_WINDOW_DAYS} days)", "value": f"{len(dups):,}"},
                  {"label": "Seedlings in probable duplicates", "value": f"{int(dups['qty'].sum()):,}"},
                  {"label": "Entries blocked — farmer already received", "value": f"{len(blocked):,}"},
                  {"label": "Entries with no 'already received' check (older form)", "value": f"{len(noflag):,}"},
                  {"label": "Test submissions excluded", "value": f"{n_test:,}"},
                  {"label": "Events with GPS outside Nyandarua", "value": f"{len(outside):,}"},
                  {"label": "Species total = stated total", "value": f"{sum_ok.mean()*100:.1f}%"},
                  {"label": "Within 5–50 seedling limit", "value": f"{range_ok.mean()*100:.1f}%"}]})
dr = dups.groupby("round").agg(entries=("fid", "size"), seedlings=("qty", "sum")).reindex(ROUNDS).fillna(0)
add(s, {"type": "table", "title": "Probable duplicates by round",
        "columns": ["round", "duplicate entries", "seedlings"],
        "rows": [[i, int(r.entries), int(r.seedlings)] for i, r in dr.iterrows()],
        "note": "The form's 'already received' check only uses the farmer list loaded with each form version, "
                "so a farmer served twice within the same version is not blocked. Review these with field teams before reporting."})
de = dups.groupby("enum").size().sort_values(ascending=False).head(15)
add(s, bar("Probable duplicates by enumerator (top 15)", de, "entries", note="Coaching flag, not proof of error."))
fv = m["form_version"].nunique()
add(s, {"type": "note", "title": "Form versions",
        "text": f"Data spans <b>{fv}</b> deployed form versions (current: v26.04.29). Fields are matched by name, so version changes do not break the pipeline."})

# ════════════════════════════════════════════════════════════════════════════
# 7 · Feedback
# ════════════════════════════════════════════════════════════════════════════
s = sec("s7", "7 · Feedback", "Themes in enumerator / farmer comments. Comments are reduced to keyword counts to avoid exposing personal details.")
cm = m["comments"].str.strip()
sub = cm[~cm.str.lower().isin(NEG_FEEDBACK)]
STOP = set(("the and for that this have with they will from your you are not but was has would were "
            "them then there their what when which about more some very also been being").split())
words = re.findall(r"[a-z]{4,}", " ".join(sub.str.lower()))
wf = pd.Series([w for w in words if w not in STOP], dtype=str).value_counts().head(25)
add(s, bar("Most frequent keywords in comments", wf, "mentions", tall=True,
           note=f"{len(sub):,} substantive comments out of {len(m):,} events ({len(sub)/len(m)*100:.0f}%)."))

# ════════════════════════════════════════════════════════════════════════════
# 8 · Measurement Framework (logframe KPIs, Google Sheet → Supabase Sprint 27)
# ════════════════════════════════════════════════════════════════════════════
MF_SHEET = "1tAW3zllJ1UYYIbMl5XTqVQhN8MBXrcFRKMm3erD1aN4"
MF_GID = 2028076445                                    # tab "dashboard_input"
NOW_YM = pd.to_datetime(m["submitted_at"], errors="coerce", utc=True).max().strftime("%Y-%m")
if not mf.empty:
    s = sec("s8", "8 · Measurement Framework",
            "Project logframe KPIs against end-of-project targets, from the SAVE M&E framework. "
            "Values are updated by the M&E team in the embedded sheet below and refresh on the dashboard nightly.")
    mf = mf.sort_values(["indicator_id", "period_end"]).reset_index(drop=True)
    for c_ in ["total", "male", "female", "youth", "survival_pct", "end_target"]:
        mf[c_] = pd.to_numeric(mf[c_], errors="coerce")
    plab = lambda pe: pd.Timestamp(pe + "-01").strftime("%b %Y")
    sc_rows = []
    for iid, g in mf.groupby("indicator_id", sort=True):
        rep = g.dropna(subset=["total"])
        tgt = g["end_target"].dropna().max()
        cum = g["cumulative"].dropna()
        per_period = len(cum) and not cum.astype(bool).any()
        if rep.empty:
            prog, when, how = None, "not yet reported", ""
        elif per_period:
            prog, when, how = rep["total"].sum(), f"sum to {plab(rep['period_end'].iloc[-1])}", "sum of periods"
        else:
            prog, when = rep["total"].iloc[-1], plab(rep["period_end"].iloc[-1])
            how = "latest" if len(cum) else "latest — confirm cumulative/per-period"
            # A value typed into a reporting period that has not ended yet is provisional.
            # Compared with the latest Kobo submission month (not the clock) so builds stay reproducible.
            if rep["period_end"].iloc[-1] > NOW_YM:
                when += " (provisional — period not yet ended)"
        pct = round(float(prog) / float(tgt) * 100, 1) if prog is not None and tgt else None
        sc_rows.append({"id": iid, "level": g["level"].dropna().iloc[0] if g["level"].notna().any() else "",
                        "indicator": g["indicator"].dropna().iloc[0], "unit": g["unit"].dropna().iloc[0] if g["unit"].notna().any() else "",
                        "target": None if pd.isna(tgt) else float(tgt), "progress": None if prog is None else float(prog),
                        "when": when, "how": how, "pct": pct,
                        "notes": "; ".join(sorted(set(g["note"].dropna()) - {""}))})
    add(s, {"type": "scorecard", "title": "Progress against end-of-project targets", "rows": sc_rows,
            "note": "Progress = latest reported value for running totals; sum of periods where the sheet marks the "
                    "indicator as per-period (cumulative = N). Bars are capped at 100% of the end target; the % shows the true figure."})

    def series_of(iid):
        g = mf[(mf["indicator_id"] == iid)].dropna(subset=["total"])
        return {pe: float(v) for pe, v in zip(g["period_end"], g["total"])}
    periods = sorted(mf["period_end"].unique())
    rep_periods = [p_ for p_ in periods if mf[(mf["period_end"] == p_) & mf["total"].notna()].shape[0]]
    last = max(rep_periods) if rep_periods else periods[0]
    axis = [p_ for p_ in periods if p_ <= last]
    tgt_of = lambda iid: float(mf.loc[mf["indicator_id"] == iid, "end_target"].dropna().max())

    planted = series_of("SAVE-01")
    if planted:
        # Cross-check against the Kobo distribution form: seedlings handed out up to each reporting date
        dist = R.assign(pe=R["start_dt"].dt.tz_convert("Africa/Nairobi").dt.strftime("%Y-%m"))
        dist_cum = [int(dist.loc[dist["pe"] <= p_, "qty"].sum()) for p_ in axis]
        add(s, {"type": "line", "title": "Trees planted vs end target (with seedlings distributed, Kobo)",
                "labels": [plab(p_) for p_ in axis],
                "series": [{"label": "trees planted (logframe)", "data": [planted.get(p_) for p_ in axis]},
                           {"label": "seedlings distributed (Kobo form, cumulative)", "data": dist_cum},
                           {"label": "end target", "data": [tgt_of("SAVE-01")] * len(axis)}],
                "note": "Distributed counts come from this dashboard's Kobo data, cut at each reporting month; planted counts are as reported in the framework."})
    surv = mf[(mf["indicator_id"] == "SAVE-02")].dropna(subset=["survival_pct"])
    if len(surv):
        add(s, {"type": "line", "title": "Reported tree survival rate (%)",
                "labels": [plab(p_) for p_ in surv["period_end"]],
                "series": [{"label": "survival rate %", "data": [float(v) for v in surv["survival_pct"]]}],
                "note": "From the 'trees restored' indicator. Restored-tree counts are missing after Dec 2024 — only rates were reported."})
    people = [i_ for i_ in ["SAVE-13", "SAVE-09"] if series_of(i_)]
    if people:
        add(s, {"type": "line", "title": "Farmers trained and community members benefiting vs targets",
                "labels": [plab(p_) for p_ in axis],
                "series": sum([[{"label": mf.loc[mf["indicator_id"] == i_, "indicator"].iloc[0].replace("# of ", ""),
                                 "data": [series_of(i_).get(p_) for p_ in axis]},
                                {"label": f"target ({int(tgt_of(i_)):,})", "data": [tgt_of(i_)] * len(axis)}] for i_ in people], []),
                "note": "Values as reported each period. Whether these are running totals is not yet confirmed in the sheet (cumulative column blank)."})
    gl = (mf.dropna(subset=["male", "female"]).sort_values("period_end").groupby("indicator_id").tail(1))
    if len(gl):
        short = lambda t: re.sub(r"^# of ", "", t).split(" (")[0][:48]
        add(s, {"type": "stacked", "title": "Gender split — latest period with a breakdown",
                "labels": [f"{short(r.indicator)} ({plab(r.period_end)})" for r in gl.itertuples()],
                "series": [{"label": "male", "data": [int(v) for v in gl["male"]]},
                           {"label": "female", "data": [int(v) for v in gl["female"]]}],
                "note": "Youth counts overlap male/female and are shown in the sheet."})
    add(s, {"type": "iframe", "title": "Update values — SAVE M&E framework (tab: dashboard_input)",
            "src": f"https://docs.google.com/spreadsheets/d/{MF_SHEET}/edit?gid={MF_GID}&rm=minimal",
            "link": f"https://docs.google.com/spreadsheets/d/{MF_SHEET}/edit#gid={MF_GID}",
            "note": "Edit the yellow columns (total, male, female, youth, survival %) and set cumulative = Y (running total) or N (per period). "
                    "Editing needs Google access to the sheet; changes appear on the charts after the nightly refresh "
                    f"(last loaded {str((meta[0].get('framework_synced_at') if meta else '') or '')[:10]})."})
    print(f"  framework: {mf['indicator_id'].nunique()} indicators, {int(mf['total'].notna().sum())} reported values")

# ════════════════════════════════════════════════════════════════════════════
# Summary dashboard (interactive)
# ════════════════════════════════════════════════════════════════════════════
fidx = {k: i for i, k in enumerate(R["fid"].unique())}
records = [[r.subcounty, r.ward, r.round, r.ym, fidx[r.fid], int(r.qty), 1 if r.dup else 0, 1 if r.first_time else 0]
           + [int(getattr(r, k)) for k in SP_KEYS]
           for r in R.itertuples()]
EXEC = {
    "records": records,
    "fields": ["subcounty", "ward", "round", "ym", "farmer", "seedlings", "dup", "first"] + SP_KEYS,
    "species": [[k, SP_NAMES[k]] for k in SP_KEYS],
    "subcounties": sorted(R["subcounty"].unique().tolist()),
    "wards": sorted(R["ward"].unique().tolist()),
    "ward_sc": {w: sc for w, sc in R[["ward", "subcounty"]].drop_duplicates().values},
    "rounds": ROUNDS,
}
# ── Profiled register vs reached (Sprint 26) ──────────────────────────────────
# Reach is matched on the beneficiary ID. For the round filter we keep each farmer's
# FIRST round, so "reached by round Rn" is cumulative coverage up to that round.
PROFILED = None
if not pf.empty:
    pf = pf.sort_values("beneficiary_id").reset_index(drop=True)
    first_round = (R.assign(key=R["fid"].str.upper()).sort_values(["start_dt", "_id", "entry_no"], kind="stable")
                   .drop_duplicates("key").set_index("key")["round_no"])
    rpos = {int(n): i for i, n in enumerate(rl["round_no"])}          # round_no -> index in ROUNDS
    pf["first"] = pf["beneficiary_id"].map(first_round).map(lambda n: rpos.get(int(n), -1) if pd.notna(n) else -1)
    reg_keys = set(pf["beneficiary_id"])
    not_in_reg = int((~R["fid"].str.upper().drop_duplicates().isin(reg_keys)).sum())
    ap = pd.to_numeric(pf["approved_plots"], errors="coerce").fillna(0)
    synced = (meta[0].get("profiled_synced_at") if meta else None) or ""
    PROFILED = {
        "fields": ["subcounty", "ward", "gender", "youth", "first", "in_area"],
        "records": [[r.sub_county or "(blank)", r.ward or "(blank)", r.gender or "", 1 if r.age_group == "youth" else 0,
                     int(r.first), 1 if r.in_project_area else 0] for r in pf.itertuples()],
        "source": pf["source_sheet"].dropna().iloc[0] if pf["source_sheet"].notna().any() else "profiled register",
        "synced": str(synced)[:10],
        "out_of_area": int((~pf["in_project_area"].fillna(False).astype(bool)).sum()),
        "not_in_register": not_in_reg,
        "zero_plot_reached": int(((ap == 0) & (pf["first"] >= 0)).sum()),
        "zero_plot": int((ap == 0).sum()),
    }
    print(f"  profiled: {len(pf):,} register | reached {int((pf['first'] >= 0).sum()):,} | "
          f"not in register {not_in_reg} | out of area {PROFILED['out_of_area']}")
EXEC["profiled"] = PROFILED

GLOBAL = {
    "events": len(m), "events_all": N_ALL, "entries": len(R),
    "farmers": int(R["fid"].nunique()), "seedlings": int(R["qty"].sum()),
    "villages": int(R["village"].nunique()), "rounds": len(ROUNDS),
    "date_min": str(m["date"].dropna().min()), "date_max": str(m["date"].dropna().max()),
    # latest submission (not build time) so quiet nights produce an identical file → no commit
    "built": pd.to_datetime(m["submitted_at"], errors="coerce", utc=True).max()
               .tz_convert("Africa/Nairobi").strftime("%Y-%m-%d %H:%M EAT"),
}
DATA = to_native({"sections": SECTIONS, "exec": EXEC, "global": GLOBAL})
payload = json.dumps(DATA, separators=(",", ":"))
print(f"  payload size: {len(payload)/1e6:.2f} MB  | records embedded: {len(records):,}")

with open(os.path.join(HERE, "dashboard_template.html"), "r", encoding="utf-8") as fh:
    template = fh.read()
with open(OUT_HTML, "w", encoding="utf-8") as fh:
    fh.write(template.replace("/*__DATA__*/", payload))
print(f"  wrote {OUT_HTML}  ({os.path.getsize(OUT_HTML)/1e6:.2f} MB)")
