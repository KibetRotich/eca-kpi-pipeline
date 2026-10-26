"""Clean the fetched UG seedlings CSVs, join distribution to application, and derive
the analytic flags, writing rows shaped exactly like the ug_seed_* Supabase tables:

  clean_applications.json  -> ug_seed_applications
  clean_items.json         -> ug_seed_application_items
  clean_dist_events.json   -> ug_seed_dist_events
  clean_dist_entries.json  -> ug_seed_dist_entries

Join: dist sub_id__farmer_id = '<application _id>__<farmer_ref_no>'.

Derived here (single source of truth — the dashboard reads them back from Supabase):
  matched        entry's application _id exists in the application data
  is_legacy      2023–24 trial entries: no seedlings recorded and no lookup values
                 (there were no distributions for the 2023–24 application rounds)
  is_repeat      not the first delivery recorded for this application (earliest wins)
  is_distributed application has >= 1 non-repeat delivery with seedlings given
  days_to_distribution  first delivery − application submission, in days
"""
import os, json
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SEEDLINGS_DATA_DIR", HERE)
PLACE = {"", "0", "00", "000", "0000", "00000", "000000", "na", "n/a", "none",
         "nil", "null", "-", ".", "x", "xx", "no", "ni", "yed", "n /a", "n.a"}
PHOTO_COLS = ["form_photo_page_1", "form_photo_page_2", "form_photo_page_3", "form_photo_page_4"]


def nn(v):
    """pandas scalar -> JSON-safe python value."""
    if v is None or v is pd.NaT or v is pd.NA or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, str) and v == "":
        return None
    return v


def rows(df, cols):
    return [{c: nn(v) for c, v in zip(cols, r)} for r in df[cols].itertuples(index=False)]


def main():
    rd = lambda n: pd.read_csv(os.path.join(DDIR, n), dtype=str, keep_default_na=False)
    m, it = rd("seedlings_main.csv"), rd("seedlings_items.csv")
    ev, en = rd("seedlings_dist_events.csv"), rd("seedlings_dist_entries.csv")
    num = lambda s: pd.to_numeric(s.replace("", np.nan), errors="coerce")
    ts = lambda s: pd.to_datetime(s.replace("", None), errors="coerce", utc=True, format="ISO8601")
    miss = lambda s: s.str.strip().str.lower().isin(PLACE)

    # ── applications ──
    a = pd.DataFrame({
        "kobo_id": num(m["_id"]).astype("Int64"), "uuid": m["_uuid"], "form_version": m["__version__"],
        "submitted_at": ts(m["_submission_time"]), "started_at": ts(m["application_start"]),
        "ended_at": ts(m["application_end"]),
        "region": m["region"], "district": m["district"], "cooperative": m["cooperative"],
        "other_cooperative": m["other_cooperatives"], "project": m["project"],
        "farmer_id": m["farmer_id"], "manual_farmer_id": m["manual_farmer_id"],
        "have_farmer_id": m["have_farmer_id"], "no_farmer_id_reason": m["no_farmer_id_reason"],
        "already_applied": m["farmer__already_applied"],
        "has_national_id": m["has_national_id"].str.lower().eq("true"),
        "has_witness": m["has_witness"].str.lower().eq("true"),
        "witness_date": pd.to_datetime(m["witness_date"].replace("", None), errors="coerce").dt.strftime("%Y-%m-%d"),
        "n_form_photos": sum((~miss(m[c])).astype(int) for c in PHOTO_COLS),
        "enumerator": m["enumerator"], "comments": m["comments_questions_001"],
        "suggested_seedlings": m["suggested_seedlings"],
    })
    for c in ["total_seedlings", "total_seedlings_cost", "facilitation_cost", "transport_cost", "grand_total"]:
        a[c] = num(m[c])
    loc = m["application_location"].str.split(expand=True)
    a["lat"] = num(loc[0]) if 0 in loc else np.nan
    a["lon"] = num(loc[1]) if 1 in loc else np.nan
    # beneficiary ID: looked-up Solidaridad ID, else scanned card, else typed fallback
    ben = m["farmer__sol_beneficiary_id"].where(~miss(m["farmer__sol_beneficiary_id"]), m["farmer_id"])
    a["beneficiary_id"] = ben.where(~miss(ben), m["manual_farmer_id"]).str.strip()
    name = m["enumarator_names"].where(~miss(m["enumarator_names"]), m["enumarator_names_other"])
    a["enumerator_name"] = name.where(~miss(name), "")

    # ── items ──
    it["item_no"] = it.groupby("_id").cumcount() + 1
    items = pd.DataFrame({
        "application_kobo_id": num(it["_id"]).astype("Int64"), "item_no": it["item_no"],
        "species": it["advance_item"], "quantity_raw": it["advance_item_quantity"],
        "quantity": num(it["advance_item_quantity"]), "other_species_name": it["other_species_name"],
        "line_cost": num(it["total_line_cost"]),
    })

    # ── distribution events ──
    loc = ev["location"].str.split(expand=True)
    e = pd.DataFrame({
        "kobo_id": num(ev["_id"]).astype("Int64"), "uuid": ev["_uuid"], "form_version": ev["__version__"],
        "submitted_at": ts(ev["_submission_time"]), "started_at": ts(ev["application_start"]),
        "is_test": ev["real_test_submission"].str.strip().str.lower().eq("test"),
        "country": ev["admin_level_0"], "region": ev["admin_level_1"], "district": ev["admin_level_2"],
        "distribution_name": ev["distribution_name"],
        "lat": num(loc[0]) if 0 in loc else np.nan, "lon": num(loc[1]) if 1 in loc else np.nan,
        "enumerator": ev["enumarator_names"], "comments": ev["comments_questions2"],
    })
    e["n_farmers"] = e["kobo_id"].map(num(en["_id"]).astype("Int64").value_counts()).fillna(0).astype(int)

    # ── distribution entries + join ──
    key = en["sub_id__farmer_id"].str.strip()
    f = pd.DataFrame({
        "event_kobo_id": num(en["_id"]).astype("Int64"), "entry_no": num(en["entry_no"]).astype("Int64"),
        "application_kobo_id": pd.to_numeric(key.str.split("__").str[0], errors="coerce").astype("Int64"),
        "farmer_ref_no": key.str.split("__", n=1).str[1].fillna(""),
        "beneficiary_id": en["farmer__sol_beneficiary_id"].str.strip(),
        "reg_district": en["farmer__admin_level_2"], "reg_sub_county": en["farmer__admin_level_3"],
        "cooperative": en["farmer__cooperative_name"],
        "applied_total": num(en["farmer__seedlings_applied_total"]).round().astype("Int64"),
        "applied_cost": num(en["farmer__seedlings_applied_cost"]),
        "already_given": en["farmer__seedlings_given"],
        "seedlings_given": num(en["total_seedlings_given"]).round().astype("Int64"),
    })
    evi = e.set_index("kobo_id")
    f["distributed_at"] = f["event_kobo_id"].map(evi["started_at"].fillna(evi["submitted_at"]))
    f["is_test"] = f["event_kobo_id"].map(evi["is_test"]).fillna(False).astype(bool)
    f["matched"] = f["application_kobo_id"].isin(set(a["kobo_id"].dropna()))
    f["is_legacy"] = (~f["matched"]) & f["seedlings_given"].isna() & f["applied_total"].isna()
    # first real delivery per application wins; later ones are repeats
    deliv = f[~f["is_test"] & f["matched"] & (f["seedlings_given"].fillna(0) > 0)]
    first = deliv.sort_values(["distributed_at", "event_kobo_id", "entry_no"]).drop_duplicates("application_kobo_id")
    f["is_repeat"] = False
    f.loc[deliv.index.difference(first.index), "is_repeat"] = True
    # a second entry for an application the form itself flagged "already given" is a repeat too
    later = f["matched"] & ~f["is_test"] & ~f.index.isin(first.index) & f["application_kobo_id"].isin(first["application_kobo_id"])
    f.loc[later, "is_repeat"] = True

    fi = first.set_index("application_kobo_id")
    a["is_distributed"] = a["kobo_id"].isin(fi.index)
    a["first_distributed_at"] = a["kobo_id"].map(fi["distributed_at"])
    a["seedlings_given"] = a["kobo_id"].map(fi["seedlings_given"]).astype("Int64")
    a["days_to_distribution"] = ((a["first_distributed_at"] - a["submitted_at"]).dt.total_seconds() // 86400).astype("Int64")
    cnt = f[f["matched"] & ~f["is_test"]]["application_kobo_id"].value_counts()
    a["n_dist_entries"] = a["kobo_id"].map(cnt).fillna(0).astype(int)

    out = {
        "applications": rows(a, ["kobo_id", "uuid", "form_version", "submitted_at", "started_at", "ended_at",
                                 "region", "district", "cooperative", "other_cooperative", "project", "lat", "lon",
                                 "beneficiary_id", "farmer_id", "manual_farmer_id", "have_farmer_id",
                                 "no_farmer_id_reason", "already_applied", "has_national_id", "has_witness",
                                 "witness_date", "n_form_photos", "total_seedlings", "total_seedlings_cost",
                                 "facilitation_cost", "transport_cost", "grand_total", "enumerator",
                                 "enumerator_name", "comments", "suggested_seedlings", "is_distributed",
                                 "first_distributed_at", "seedlings_given", "days_to_distribution", "n_dist_entries"]),
        "items": rows(items, list(items.columns)),
        "dist_events": rows(e, list(e.columns)),
        "dist_entries": rows(f, ["event_kobo_id", "entry_no", "application_kobo_id", "farmer_ref_no",
                                 "beneficiary_id", "reg_district", "reg_sub_county", "cooperative",
                                 "applied_total", "applied_cost", "already_given", "seedlings_given",
                                 "distributed_at", "matched", "is_legacy", "is_repeat"]),
    }
    for name, data in out.items():
        with open(os.path.join(DDIR, f"clean_{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        print(f"  clean_{name}.json: {len(data):,} rows")

    real = f[~f["is_test"]]
    print(f"  dist entries (real): {len(real):,} | matched {int(real['matched'].sum()):,} | "
          f"legacy {int(real['is_legacy'].sum()):,} | repeats {int(real['is_repeat'].sum()):,} | "
          f"unmatched non-legacy {int((~real['matched'] & ~real['is_legacy']).sum()):,}")
    print(f"  applications served: {int(a['is_distributed'].sum()):,} of {len(a):,}")


if __name__ == "__main__":
    main()
