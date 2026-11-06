"""Turn hc_dist_raw.json into clean_entries.json, shaped exactly like the hc_dist_entries table.

Derived here (single source of truth — the dashboard reads them back from Supabase):
  month_label         month of the distribution date, e.g. 'Mar 2026' (the dashboard's "distribution month")
  month_matches_date  the month picked in the form equals the month of the date
  is_first_receipt    first time this farmer code received seedlings (earliest date)
  is_probable_dup     the same farmer code recorded again within DUP_WINDOW_DAYS
  code_valid          farmer code follows the AA-99-99 pattern
  selection_matches   a count is given for every ticked species, and only for those
"""
import os, re, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("HC_DATA_DIR", HERE)
SPECIES = ["albizia", "ficus_mucuso", "ficus_natalensis", "calliandra"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
DUP_WINDOW_DAYS = 7
CODE_RE = re.compile(r"^[A-Z]{2}-\d{2}-\d{2}$")


def seg(sub):
    """Key every field on its last path segment (version-robust)."""
    return {k.split("/")[-1]: v for k, v in sub.items()}


def txt(v):
    v = " ".join(str(v or "").split())
    return v or None


def place(v):
    v = txt(v)
    return v.title() if v else None


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def ts(v):
    return v or None


def main():
    raw = json.load(open(os.path.join(DDIR, "hc_dist_raw.json"), encoding="utf-8"))
    rows = []
    for sub in raw:
        s = seg(sub)
        d = s.get("date_of_distribution") or (s.get("start") or "")[:10] or None
        dd = datetime.date.fromisoformat(d) if d else None
        picked = (s.get("distribution_month") or "").strip().lower() or None
        counts = {k: num(s.get(f"{k}_count")) for k in SPECIES}
        ticked = set((s.get("tree_species") or "").split())
        given = {k for k, v in counts.items() if v}
        total = sum(v or 0 for v in counts.values())
        code = (s.get("farmers_code") or "").strip().upper() or None
        rows.append({
            "kobo_id": int(s["_id"]), "uuid": s.get("_uuid"), "form_version": s.get("__version__"),
            "submitted_at": ts(s.get("_submission_time")), "started_at": ts(s.get("start")), "ended_at": ts(s.get("end")),
            "distributed_on": d,
            "distribution_month": picked,
            "month_label": dd.strftime("%b %Y") if dd else None,
            "month_matches_date": (picked == MONTHS[dd.month - 1]) if (picked and dd) else None,
            "region": (s.get("region") or "").strip().lower() or None,
            "district": (s.get("district") or "").strip().lower() or None,
            "sub_county": place(s.get("sub_county")), "village": place(s.get("village")),
            "farmer_code": code, "code_valid": bool(code and CODE_RE.match(code)),
            "sex": (s.get("sex") or "").strip().lower() or None,
            "age_group": (s.get("age") or "").strip().lower() or None,
            "species_selected": " ".join(sorted(ticked)) or None,
            **counts,
            "total_seedlings": total,
            "selection_matches": ticked == given,
            "staff": txt(s.get("staff_in_charge")), "enumerator": txt(s.get("enumerators_name")),
        })

    # First receipt / probable duplicates per farmer code, in date order
    order = sorted(rows, key=lambda r: (r["distributed_on"] or "9999", r["started_at"] or "", r["kobo_id"]))
    last_seen = {}
    for r in order:
        c = r["farmer_code"] if r["code_valid"] else None
        r["is_first_receipt"] = c is None or c not in last_seen
        r["is_probable_dup"] = False
        if c and c in last_seen and r["distributed_on"] and last_seen[c]:
            gap = (datetime.date.fromisoformat(r["distributed_on"]) - datetime.date.fromisoformat(last_seen[c])).days
            r["is_probable_dup"] = 0 <= gap <= DUP_WINDOW_DAYS
        if c:
            last_seen[c] = r["distributed_on"]

    with open(os.path.join(DDIR, "clean_entries.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, separators=(",", ":"))
    print(f"transform: {len(rows):,} entries; {sum(r['is_probable_dup'] for r in rows)} probable duplicates; "
          f"{sum(not r['code_valid'] for r in rows)} invalid codes; "
          f"{sum(r['month_matches_date'] is False for r in rows)} month/date mismatches")


if __name__ == "__main__":
    main()
