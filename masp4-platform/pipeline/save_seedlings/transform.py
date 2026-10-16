"""Clean the fetched SAVE KE distribution CSVs and derive the analytic flags, writing
rows shaped exactly like the save_dist_* Supabase tables:

  clean_events.json   -> save_dist_events
  clean_entries.json  -> save_dist_farmer_entries

Derived here (single source of truth — the dashboard reads them back from Supabase):
  round_no / round_label  a pause of > ROUND_GAP_DAYS between events opens a new round
  is_probable_dup         same farmer recorded again within DUP_WINDOW_DAYS
  is_first_receipt        first entry where this farmer actually received seedlings
  gps_in_area             event GPS inside the Nyandarua bounding box
"""
import os, json
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SAVE_DATA_DIR", HERE)

SPECIES_COLS = {"cordia": "cordia", "bamboo": "bamboo", "grivellea": "grevillea", "dombeya": "dombeya",
                "sesbania": "sesbania", "calliandra": "calliandra", "azadirachta": "azadirachta",
                "avocado": "avocado", "apple": "apple"}   # form prefix -> table column
ROUND_GAP_DAYS = 21
DUP_WINDOW_DAYS = 7
LAT_RNG, LON_RNG = (-0.9, 0.4), (36.0, 36.9)


def nn(v):
    """pandas scalar -> JSON-safe python value."""
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NaT:
        return None
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def main():
    m = pd.read_csv(os.path.join(DDIR, "save_dist_main.csv"), dtype=str, keep_default_na=False)
    f = pd.read_csv(os.path.join(DDIR, "save_dist_farmers.csv"), dtype=str, keep_default_na=False)
    num = lambda s: pd.to_numeric(s.replace("", np.nan), errors="coerce")
    ts = lambda s: pd.to_datetime(s.replace("", None), errors="coerce", utc=True)

    m["is_test"] = m["real_test_submission"].str.strip().str.lower().eq("test")
    m["started_at"] = ts(m["application_start"])
    loc = m["location"].str.split(expand=True)
    m["lat"] = num(loc[0]) if 0 in loc else np.nan
    m["lon"] = num(loc[1]) if 1 in loc else np.nan
    m["gps_in_area"] = m["lat"].between(*LAT_RNG) & m["lon"].between(*LON_RNG)

    # Rounds over REAL events only; test events get no round
    real = m[~m["is_test"]].dropna(subset=["started_at"]).sort_values("started_at")
    rid = (real["started_at"].diff().dt.days > ROUND_GAP_DAYS).cumsum() + 1
    m["round_no"] = rid.reindex(m.index)
    bounds = real.assign(r=rid).groupby("r")["started_at"].agg(["min", "max"])
    label = {r: f"R{r} · {b['min']:%b %Y}" + ("" if b["min"].strftime("%Y-%m") == b["max"].strftime("%Y-%m")
                                              else f"–{b['max']:%b %Y}") for r, b in bounds.iterrows()}
    m["round_label"] = m["round_no"].map(label)

    events = [{
        "kobo_id": int(r["_id"]), "uuid": r["_uuid"] or None, "form_version": r["__version__"] or None,
        "submitted_at": nn(ts(pd.Series([r["_submission_time"]]))[0]),
        "started_at": nn(r["started_at"]),
        "ended_at": nn(ts(pd.Series([r["application_end"]]))[0]),
        "is_test": bool(r["is_test"]),
        "sub_county": r["admin_level_2"] or None, "ward": r["admin_level_3"] or None,
        "village": r["admin_level_4"].strip().title() or None,
        "lat": nn(r["lat"]), "lon": nn(r["lon"]), "gps_in_area": bool(r["gps_in_area"]),
        "enumerator": " ".join(r["enumarator_names"].split()) or None,
        "comments": r["comments_questions"].strip() or None,
        "n_farmers": int(r["n_farmers"] or 0),
        "round_no": int(r["round_no"]) if not pd.isna(r["round_no"]) else None,
        "round_label": r["round_label"] if isinstance(r["round_label"], str) else None,
    } for _, r in m.iterrows()]

    x = f.merge(m[["_id", "is_test", "started_at"]], on="_id", how="left")
    x["qty"] = num(x["total_seedlings_given"])
    x["calc"] = num(x["total_seedlings_calculated"])
    x["fid"] = x["farmer__sol_beneficiary_id"].where(x["farmer__sol_beneficiary_id"] != "", x["farmer_ref_no"])
    x["received"] = (x["qty"].fillna(0) > 0) & ~x["is_test"]
    # Flags are computed over real, received entries in time order
    rx = x[x["received"]].sort_values(["started_at", "_id", "entry_no"])
    gap = rx.groupby("fid")["started_at"].diff().dt.days
    x["is_probable_dup"] = False
    x.loc[rx.index, "is_probable_dup"] = gap.between(0, DUP_WINDOW_DAYS).values
    x["is_first_receipt"] = False
    x.loc[rx.index[~rx.duplicated("fid").values], "is_first_receipt"] = True

    entries = []
    for _, r in x.iterrows():
        row = {
            "event_kobo_id": int(r["_id"]), "entry_no": int(r["entry_no"]),
            "beneficiary_id": r["fid"] or None, "farmer_ref_no": r["farmer_ref_no"] or None,
            "reg_sub_county": r["farmer__admin_level_2"] or None, "reg_ward": r["farmer__admin_level_3"] or None,
            "reg_village": r["farmer__village"].strip() or None,
            "cooperative": r["farmer__cooperative_name"].strip() or None,
            "already_received": r["farmer__seedlings_given"].strip().lower() or None,
            "total_seedlings": nn(int(r["qty"])) if not pd.isna(r["qty"]) else None,
            "species_sum_ok": None if pd.isna(r["qty"]) else bool(r["calc"] == r["qty"]),
            "distributed_at": nn(r["started_at"]),
            "is_probable_dup": bool(r["is_probable_dup"]), "is_first_receipt": bool(r["is_first_receipt"]),
        }
        for src, col in SPECIES_COLS.items():
            v = num(pd.Series([r[f"{src}_count"]]))[0]
            row[col] = None if pd.isna(v) else int(v)
        entries.append(row)

    for name, rows in (("events", events), ("entries", entries)):
        with open(os.path.join(DDIR, f"clean_{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(rows, fh, separators=(",", ":"))
    print(f"transform: {len(events):,} events ({int(m['is_test'].sum())} test), {len(entries):,} farmer entries; "
          f"{len(label)} rounds; {int(x['is_probable_dup'].sum())} probable duplicates")


if __name__ == "__main__":
    main()
