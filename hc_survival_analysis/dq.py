"""Data-quality battery for both forms. Emits a compact table (% complete / % failing)."""
import numpy as np, pandas as pd

f1 = pd.read_csv("data/clean/form1_batch.csv")
f2b = pd.read_csv("data/clean/form2_batch.csv")
f2s = pd.read_csv("data/clean/form2_species.csv")

rows = []
def rec(check, form, n_appl, metric_pct, note=""):
    rows.append(dict(check=check, form=form, n_applicable=n_appl,
                     pct=round(metric_pct,1) if metric_pct==metric_pct else None, note=note))

# ---------- 1. Internal consistency: planted + not_planted ~= collected ----------
def consistency(df, label, tol_abs=2, tol_rel=0.05):
    m = df[["collected","planted","not_planted"]].notna().all(axis=1)
    sub = df[m]
    diff = (sub["planted"].fillna(0)+sub["not_planted"].fillna(0)-sub["collected"]).abs()
    tol = np.maximum(tol_abs, tol_rel*sub["collected"].abs())
    ok = (diff<=tol)
    rec("Consistency: planted+not_planted ~= collected", label, int(m.sum()),
        100*ok.mean() if len(sub) else np.nan, f"% within tol; {int((~ok).sum())} fail")
consistency(f1,"Form1 (batch)")
consistency(f2s,"Form2 (species)")

# ---------- 2. alive+dead not exceeding planted; survival<=1 ----------
def alive_dead(df, label, has_missing=False):
    m = df[["alive","dead","planted"]].notna().all(axis=1)
    sub = df[m]
    over = (sub["alive"]+sub["dead"]) > (sub["planted"]+ (sub["missing"].fillna(0) if has_missing and "missing" in sub else 0)+2)
    surv_impossible = sub["alive"] > sub["planted"]+ (0)
    rec("alive+dead <= planted (+missing)", label, int(m.sum()),
        100*(~over).mean() if len(sub) else np.nan, f"{int(over.sum())} overcount rows")
    rec("survival<=1 (alive<=planted)", label, int(m.sum()),
        100*(~surv_impossible).mean() if len(sub) else np.nan, f"{int(surv_impossible.sum())} impossible (alive>planted)")
alive_dead(f1,"Form1 (batch)")
alive_dead(f2s,"Form2 (species)", has_missing=True)

# ---------- 3. Farmer-lookup integrity (calc fields resolved) ----------
rec("Farmer lookup resolved (code/bene_id present)","Form1 (batch)", len(f1),
    100*f1["farmer_code"].notna().mean(), f"{int(f1['farmer_code'].isna().sum())} unresolved")
rec("Farmer lookup resolved (code/bene_id present)","Form2 (batch)", len(f2b),
    100*f2b["farmer_bene_id"].notna().mean(), f"{int(f2b['farmer_bene_id'].isna().sum())} unresolved")

# ---------- 4. Duplicate submissions per farmer ----------
def dups(df, key, label, timecol="sub_time"):
    d = df.dropna(subset=[key]).copy()
    n_dup_any = d[key].duplicated(keep=False).sum()
    # per farmer per month
    d[timecol] = pd.to_datetime(d[timecol], errors="coerce")
    d["ym"] = d[timecol].dt.to_period("M").astype(str)
    permonth = d.duplicated(subset=[key,"ym"], keep=False).sum()
    rec("Duplicate farmer (any period)", label, len(d), 100*n_dup_any/len(d) if len(d) else np.nan,
        f"{n_dup_any} rows share a farmer; {permonth} same farmer+month (true dup risk)")
dups(f1,"farmer_ref","Form1 (batch)")
dups(f2b,"farmer_ref","Form2 (batch)")

# ---------- 5. Count outliers vs total seedlings issued (registry) ----------
def outliers(df, label):
    m = df["collected"].notna() & df["farmer_total_seedlings"].notna() & (df["farmer_total_seedlings"]>0)
    sub = df[m]
    imp = sub["collected"] > 1.5*sub["farmer_total_seedlings"]
    rec("Collected <= 1.5x registry-issued", label, int(m.sum()),
        100*(~imp).mean() if len(sub) else np.nan, f"{int(imp.sum())} implausibly high vs issued")
outliers(f1,"Form1 (batch)")
outliers(f2b,"Form2 (batch, aggregated)")

# ---------- 6. Missingness of key analytic fields ----------
key1 = ["district","planted","alive","dead","species_taken","transport","training_received","farmer_gender"]
for k in key1:
    if k in f1: rec(f"Complete: {k}","Form1 (batch)", len(f1), 100*f1[k].replace("",np.nan).notna().mean())
key2 = ["admin2","cooperative","transport","training_received","species_taken","crop_failure","forest_cover_increase"]
for k in key2:
    if k in f2b: rec(f"Complete: {k}","Form2 (batch)", len(f2b), 100*f2b[k].replace("",np.nan).notna().mean())
for k in ["species","planted","alive","dead"]:
    if k in f2s: rec(f"Complete: {k}","Form2 (species)", len(f2s), 100*f2s[k].replace("",np.nan).notna().mean())

# ---------- 7. Geopoint sanity ----------
def geo(df,label,latmin,latmax,lonmin,lonmax):
    m = df["lat"].notna() & df["lon"].notna()
    sub=df[m]
    inb = sub["lat"].between(latmin,latmax) & sub["lon"].between(lonmin,lonmax)
    rec("Geopoint present", label, len(df), 100*m.mean(), f"{int((~m).sum())} missing GPS")
    rec("Geopoint within country bounds", label, int(m.sum()),
        100*inb.mean() if len(sub) else np.nan, f"{int((~inb).sum())} out of bounds")
geo(f1,"Form1 (batch)", -1.6,4.3, 29.4,35.2)     # Uganda
geo(f2b,"Form2 (batch)", -4.8,5.2, 33.8,42.0)    # Kenya

dq = pd.DataFrame(rows)
dq.to_csv("out/data_quality.csv", index=False)
pd.set_option("display.width",200,"display.max_colwidth",60,"display.max_rows",100)
print(dq.to_string(index=False))
