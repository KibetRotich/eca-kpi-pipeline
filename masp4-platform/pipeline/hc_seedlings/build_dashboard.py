"""Build the self-contained "Seedlings Distribution – Uganda (Harvesting Carbon)" dashboard from the
hc_dist_* Supabase tables (Sprint 68), loaded nightly from Kobo form afH6NHNNZmVHQfCnuxGx3p.

Same block contract and template style as pipeline/save_seedlings (SAVE KE Seedlings Distribution):
results are a JSON blob of typed blocks rendered by generic JS + Chart.js; the Summary filters
client-side over an embedded entry array.

PII policy: the deploy repo is PUBLIC, so the page carries counts only. Farmer codes become integer
indices; staff and enumerators appear as codes (S01…, E01… numbered by first submission, so a code
stays with the same person between builds). Farmer names and phones are never stored upstream.

Output: <repo>/public/HC_Seedlings_UG_Dashboard.html
"""
import os, sys, json
import httpx
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_HTML = os.environ.get("HC_OUT", os.path.join(REPO_ROOT, "public", "HC_Seedlings_UG_Dashboard.html"))
os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)
sys.path.insert(0, HERE)
from load_supabase import _load_env, select_all  # noqa: E402

SPECIES = {  # column -> display name
    "albizia": "Albizia coriaria (Mugavu / Omusisa)",
    "ficus_mucuso": "Ficus mucuso (Mukunyu / Omukunyu)",
    "ficus_natalensis": "Ficus natalensis (Mutuuba / Omutooma)",
    "calliandra": "Calliandra",
}
SP_KEYS = list(SPECIES)
SEX = {"male": "Men", "female": "Women"}
AGE = {"youth": "Youth (18–35)", "adult": "Adults (35–65)", "elderly": "Elderly (65+)"}
DUP_WINDOW_DAYS = 7          # must match transform.py (label text only)
LARGE = 100                  # seedlings per farmer flagged for review (no limit is set in the form)


def to_native(o):
    if isinstance(o, dict):
        return {k: to_native(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [to_native(v) for v in o]
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if (pd.isna(o) or np.isinf(o)) else round(float(o), 4)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


# ── Load ──────────────────────────────────────────────────────────────────────
print("Loading from Supabase...")
url, key = _load_env()
with httpx.Client(timeout=120) as c:
    x = pd.DataFrame(select_all(c, url, key, "hc_dist_entries", "*"))
if x.empty:
    sys.exit("hc_dist_entries is empty — run fetch → transform → load first")
x = x.sort_values(["distributed_on", "started_at", "kobo_id"], na_position="last", kind="stable").reset_index(drop=True)
num = lambda s: pd.to_numeric(s, errors="coerce")
for k in SP_KEYS + ["total_seedlings"]:
    x[k] = num(x[k]).fillna(0).astype(int)
x["date"] = pd.to_datetime(x["distributed_on"], errors="coerce")
x["ym"] = x["date"].dt.strftime("%Y-%m")
x["month"] = x["month_label"].fillna("(no date)")
x["district_l"] = x["district"].fillna("(blank)").str.title()
x["subcounty"] = x["sub_county"].fillna("(blank)")
x["village"] = x["village"].fillna("(blank)")
x["sex_l"] = x["sex"].map(SEX).fillna("Not stated")
x["age_l"] = x["age_group"].map(AGE).fillna("Not stated")
x["qty"] = x["total_seedlings"]
x["dup"] = x["is_probable_dup"].fillna(False).astype(bool)
x["first"] = x["is_first_receipt"].fillna(False).astype(bool)
# farmer identity: valid code, else the submission itself (never merged)
x["fid"] = np.where(x["code_valid"].fillna(False), x["farmer_code"].fillna(""), "kobo:" + x["kobo_id"].astype(str))
MONTHS = (x.dropna(subset=["date"]).sort_values("date").drop_duplicates("month_label")["month_label"].tolist())


def staff_codes(col, prefix):
    """Codes numbered by first submission so they stay stable between nightly builds."""
    n = x[col].fillna("").str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
    first = (pd.DataFrame({"n": n, "t": x["submitted_at"]}).query("n != ''")
             .groupby("n")["t"].min().sort_values(kind="stable"))
    codes = {name: f"{prefix}{i + 1:02d}" for i, name in enumerate(first.index)}
    return n.map(codes)


x["staff_c"] = staff_codes("staff", "S")
x["enum_c"] = staff_codes("enumerator", "E")
R = x[x["qty"] > 0]
RD = R[~R["dup"]]
print(f"  entries={len(x):,} received={len(R):,} farmers={R['fid'].nunique():,} seedlings={int(R['qty'].sum()):,} months={MONTHS}")

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


# ── 1 · Reach & Geography ─────────────────────────────────────────────────────
s = sec("s1", "Reach & Geography", "Where seedlings went: district, sub-county and village.")
geo = (R.groupby(["district_l", "subcounty"]).agg(entries=("fid", "size"), farmers=("fid", "nunique"),
                                                  seedlings=("qty", "sum"), villages=("village", "nunique"))
       .reset_index().sort_values("seedlings", ascending=False))
geo["per_farmer"] = (geo["seedlings"] / geo["farmers"]).round(1)
add(s, {"type": "table", "title": "Reach by sub-county",
        "columns": ["district", "sub-county", "farmer entries", "unique farmers", "seedlings", "villages", "seedlings / farmer"],
        "rows": [[r.district_l, r.subcounty, int(r.entries), int(r.farmers), int(r.seedlings), int(r.villages), r.per_farmer]
                 for r in geo.itertuples()],
        "note": "Sub-county and village are typed by enumerators; spelling variants may split a place."})
add(s, bar("Unique farmers reached by district", R.groupby("district_l")["fid"].nunique().sort_values(ascending=False),
           "farmers", horizontal=False))
add(s, bar("Seedlings distributed by district", R.groupby("district_l")["qty"].sum().sort_values(ascending=False),
           "seedlings", horizontal=False))
vil = R.groupby("village")["fid"].nunique().sort_values(ascending=False)
add(s, bar(f"Villages by farmers reached ({len(vil)} villages)", vil.head(25), "farmers", tall=True))
hm = R.groupby("subcounty")[SP_KEYS].sum()
add(s, {"type": "heatmap", "title": "Sub-county × species — seedlings distributed",
        "ylabels": list(hm.index), "xlabels": [SPECIES[k] for k in hm.columns],
        "matrix": [[int(v) for v in row] for row in hm.values]})

# ── 2 · Distribution Months ───────────────────────────────────────────────────
s = sec("s2", "Distribution Months",
        "Distribution month = the month of the distribution date. A farmer is “new” the first time their farmer code "
        "receives seedlings and “returning” in any later month.")
rt = []
for mo in MONTHS:
    g = R[R["month"] == mo]
    rt.append([mo, str(g["date"].min().date()), str(g["date"].max().date()), int(g["date"].dt.date.nunique()), len(g),
               int(g["fid"].nunique()), int(g["first"].sum()), int(g["qty"].sum()),
               round(float(g["qty"].sum() / g["fid"].nunique()), 1) if len(g) else 0])
add(s, {"type": "table", "title": "Distribution months",
        "columns": ["month", "first day", "last day", "distribution days", "farmer entries", "unique farmers",
                    "new farmers", "seedlings", "seedlings / farmer"], "rows": rt})
cum = R.groupby(R["date"].dt.date)["qty"].sum().sort_index().cumsum()
add(s, {"type": "line", "title": "Cumulative seedlings distributed",
        "labels": [str(d) for d in cum.index], "series": [{"label": "cumulative seedlings", "data": [int(v) for v in cum.values]}]})
nr = R.groupby("month").agg(new=("first", "sum"), total=("fid", "nunique")).reindex(MONTHS).fillna(0)
nr["returning"] = nr["total"] - nr["new"]
add(s, stacked("New vs returning farmers per month", nr[["new", "returning"]],
               note="Returning = the farmer code already received seedlings in an earlier month."))
mpf = R.groupby("fid")["month"].nunique().value_counts().sort_index()
add(s, bar("Farmers by number of months they received seedlings in",
           mpf.rename(lambda i: f"{i} month{'s' if i > 1 else ''}"), "farmers", horizontal=False))
dd = R.groupby(R["date"].dt.date).agg(entries=("fid", "size"), seedlings=("qty", "sum"))
add(s, bar("Farmers served per distribution day", dd["entries"].rename(lambda d: str(d)), "farmer entries", horizontal=False))

# ── 3 · Species ───────────────────────────────────────────────────────────────
s = sec("s3", "Species", "Which of the four agroforestry species were distributed, and how the mix varies.")
spt = R[SP_KEYS].sum().sort_values(ascending=False)
add(s, bar("Seedlings by species", spt.rename(SPECIES), "seedlings"))
add(s, {"type": "kpi", "title": "Share of seedlings",
        "cards": [{"label": f"{SPECIES[k]}", "value": f"{v / spt.sum() * 100:.0f}% ({int(v):,})"} for k, v in spt.items()]})
sm = R.groupby("month")[list(spt.index)].sum().reindex(MONTHS).fillna(0).rename(columns=SPECIES)
add(s, stacked("Species mix by month", sm))
sd = R.groupby("district_l")[list(spt.index)].sum().rename(columns=SPECIES)
add(s, stacked("Species mix by district", sd))
reach_sp = (R[SP_KEYS] > 0).sum().reindex(spt.index).rename(SPECIES)
add(s, bar("Farmer entries receiving each species", reach_sp, "entries"))
nsp = (R[SP_KEYS] > 0).sum(axis=1).value_counts().sort_index()
add(s, bar("Species per farmer entry", nsp.rename(lambda i: f"{i} species"), "entries", horizontal=False))

# ── 4 · Who Was Reached ───────────────────────────────────────────────────────
s = sec("s4", "Who Was Reached", "Sex and age group of farmers who received seedlings, as recorded on the form (each farmer counted once).")
fu = RD.drop_duplicates("fid")
add(s, {"type": "kpi", "title": "Farmers reached",
        "cards": [{"label": "Unique farmers", "value": f"{len(fu):,}"},
                  {"label": "Women", "value": f"{(fu['sex'] == 'female').mean() * 100:.0f}%"},
                  {"label": "Youth (18–35)", "value": f"{(fu['age_group'] == 'youth').mean() * 100:.0f}%"},
                  {"label": "Young women", "value": f"{((fu['sex'] == 'female') & (fu['age_group'] == 'youth')).sum():,}"}]})
add(s, bar("Farmers by sex", fu["sex_l"].value_counts(), "farmers", horizontal=False))
add(s, bar("Farmers by age group", fu["age_l"].value_counts().reindex([v for v in AGE.values()] + ["Not stated"]).dropna(),
           "farmers", horizontal=False))
sa = pd.crosstab(fu["age_l"], fu["sex_l"]).reindex([v for v in AGE.values() if v in set(fu["age_l"])])
add(s, stacked("Age group by sex", sa))
per = R.groupby("fid").agg(q=("qty", "sum"), sex=("sex_l", "first"), age=("age_l", "first"))
add(s, bar("Average seedlings per farmer, by sex", per.groupby("sex")["q"].mean(), "seedlings", horizontal=False, rnd=1))
add(s, bar("Average seedlings per farmer, by age group", per.groupby("age")["q"].mean().reindex(
    [v for v in AGE.values() if v in set(per["age"])]), "seedlings", horizontal=False, rnd=1))

# ── 5 · Operations ────────────────────────────────────────────────────────────
s = sec("s5", "Operations", "Workload and timing. Staff and enumerators are shown as codes, not names "
                            "(S01 / E01 = the first to submit, and so on — codes stay the same from day to day).")
add(s, bar("Farmer entries per staff member in charge", x.groupby("staff_c").size().sort_values(ascending=False), "entries",
           horizontal=False))
add(s, bar("Farmer entries per enumerator", x.groupby("enum_c").size().sort_values(ascending=False), "entries",
           horizontal=False))
dur = (pd.to_datetime(x["ended_at"], errors="coerce", utc=True) - pd.to_datetime(x["started_at"], errors="coerce", utc=True)
       ).dt.total_seconds() / 60
dbins = [-1e9, 2, 5, 15, 60, 1440, 1e9]
dlabs = ["<2 min", "2–5", "5–15", "15–60", "1–24 h", ">1 day"]
add(s, bar("Form open time (start → end)", pd.cut(dur, dbins, labels=dlabs).value_counts().reindex(dlabs), "entries",
           horizontal=False, note="Long open times usually mean the form was saved and finalised later."))
lag = (pd.to_datetime(x["submitted_at"], errors="coerce", utc=True).dt.tz_localize(None).dt.normalize() - x["date"]).dt.days
lbins = [-1e9, 0, 1, 7, 30, 1e9]
llabs = ["same day", "next day", "2–7 days", "8–30 days", ">30 days"]
add(s, bar("Time from distribution to upload", pd.cut(lag, lbins, labels=llabs).value_counts().reindex(llabs), "entries",
           horizontal=False))

# ── 6 · Data Quality ──────────────────────────────────────────────────────────
s = sec("s6", "Data Quality", "Checks that protect the headline numbers. Totals elsewhere use every recorded entry.")
dups = R[R["dup"]]
rep_codes = x[x["code_valid"].fillna(False)].groupby("farmer_code").size()
add(s, {"type": "kpi", "title": "Data-quality checks",
        "cards": [{"label": f"Probable duplicate entries (same farmer code within {DUP_WINDOW_DAYS} days)", "value": f"{len(dups):,}"},
                  {"label": "Seedlings in probable duplicates", "value": f"{int(dups['qty'].sum()):,}"},
                  {"label": "Farmer codes recorded more than once", "value": f"{int((rep_codes > 1).sum()):,}"},
                  {"label": "Farmer codes not in the AA-99-99 format", "value": f"{int((~x['code_valid'].fillna(False)).sum()):,}"},
                  {"label": "Month picked ≠ month of the date", "value": f"{int((x['month_matches_date'] == False).sum()):,}"},
                  {"label": "Species ticked ≠ species counted", "value": f"{int((x['selection_matches'] == False).sum()):,}"},
                  {"label": f"Entries with more than {LARGE} seedlings", "value": f"{int((x['qty'] > LARGE).sum()):,}"},
                  {"label": "Entries with no seedlings", "value": f"{int((x['qty'] == 0).sum()):,}"}]})
qb = [0, 10, 20, 30, 50, 100, 1e9]
ql = ["1–10", "11–20", "21–30", "31–50", "51–100", f">{LARGE}"]
add(s, bar("Seedlings per farmer entry", pd.cut(R["qty"], qb, labels=ql).value_counts().reindex(ql), "entries",
           horizontal=False, note=f"median {int(R['qty'].median())} seedlings; largest {int(R['qty'].max())}. "
                                  f"Entries above {LARGE} are worth checking with the field team (e.g. a group or institution)."))
mm = x[x["month_matches_date"] == False]
if len(mm):
    add(s, {"type": "table", "title": "Month picked vs distribution date (mismatches)",
            "columns": ["month picked", "month of the date", "entries"],
            "rows": [[a.title(), b, int(n)] for (a, b), n in mm.groupby(["distribution_month", "month"]).size().items()],
            "note": "The dashboard groups by the distribution date; the month picked in the form is only checked against it."})
add(s, {"type": "note", "title": "Form versions",
        "text": f"Data spans <b>{x['form_version'].nunique()}</b> deployed form version(s). Fields are matched by name, "
                "so version changes do not break the pipeline."})

# ── Summary (interactive) ─────────────────────────────────────────────────────
fidx = {k: i for i, k in enumerate(R["fid"].unique())}
records = [[r.district_l, r.subcounty, r.month, r.ym, fidx[r.fid], int(r.qty), 1 if r.dup else 0, 1 if r.first else 0,
            r.sex or "", r.age_group or ""] + [int(getattr(r, k)) for k in SP_KEYS]
           for r in R.itertuples()]
EXEC = {
    "records": records,
    "fields": ["subcounty", "ward", "round", "ym", "farmer", "seedlings", "dup", "first", "sex", "age"] + SP_KEYS,
    "species": [[k, SPECIES[k]] for k in SP_KEYS],
    "subcounties": sorted(R["district_l"].unique().tolist()),
    "wards": sorted(R["subcounty"].unique().tolist()),
    "ward_sc": {w: d for w, d in R[["subcounty", "district_l"]].drop_duplicates().values},
    "rounds": MONTHS,
    "profiled": None,
}
GLOBAL = {
    "entries": len(R), "farmers": int(R["fid"].nunique()), "seedlings": int(R["qty"].sum()),
    "villages": int(R["village"].nunique()), "rounds": len(MONTHS),
    "date_min": str(x["date"].min().date()), "date_max": str(x["date"].max().date()),
    "built": pd.to_datetime(x["submitted_at"], errors="coerce", utc=True).max()
               .tz_convert("Africa/Kampala").strftime("%Y-%m-%d %H:%M EAT"),
}
DATA = to_native({"sections": SECTIONS, "exec": EXEC, "global": GLOBAL})
payload = json.dumps(DATA, separators=(",", ":"), ensure_ascii=False)
with open(os.path.join(HERE, "dashboard_template.html"), "r", encoding="utf-8") as fh:
    template = fh.read()
with open(OUT_HTML, "w", encoding="utf-8") as fh:
    fh.write(template.replace("/*__DATA__*/", payload))
print(f"  wrote {OUT_HTML}  ({os.path.getsize(OUT_HTML) / 1e3:.0f} KB)")
