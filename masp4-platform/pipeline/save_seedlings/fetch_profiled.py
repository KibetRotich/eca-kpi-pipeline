"""Pull the SAVE KE profiled-farmer register from Google Sheets and write
clean_profiled.json, shaped like the save_dist_profiled_farmers table (Sprint 26).

Source: "SAVE KE Profiled Farmers Summary 20241015", tab "in"
        (override with SAVE_PROFILED_SHEET_ID / SAVE_PROFILED_TAB).

Auth: GOOGLE_CREDENTIALS — the same service-account JSON (inline or a file path)
the MASP III ETL uses. The sheet must be shared (Viewer) with that service
account's client_email. Without credentials or access this script prints a
notice and exits 0 WITHOUT writing a file, so the nightly job keeps the
register already in Supabase instead of failing.

PII policy: columns are selected by header name from KEEP; first_name,
other_names, registration GPS and enumerator_names are never read into the
output. Only the pseudonymous beneficiary ID is kept, to match distributions.

  python fetch_profiled.py                 # from Google Sheets
  python fetch_profiled.py --csv FILE      # from a local CSV with the same headers
"""
import os, sys, csv, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SAVE_DATA_DIR", HERE)
SHEET_ID = os.environ.get("SAVE_PROFILED_SHEET_ID", "1nWQwYcmygu2aeEJLIUq-bVirMLtF-OVZgrTRoEAl19E")
TAB = os.environ.get("SAVE_PROFILED_TAB", "in")
SOURCE = "SAVE KE Profiled Farmers Summary 20241015"
PROJECT_WARDS = {"Kiriita", "Weru", "Charagita"}       # wards on the distribution form
SUBCOUNTY_FIX = {"oljoro orok": "Oljororok", "oljororok": "Oljororok", "ndaragwa": "Ndaragwa"}
# The distribution form fixes each ward's sub-county (admin_level_3 choice_filter). The
# register sometimes records the old/alternative name (e.g. Charagita under "Nyandarua
# West"), so for project wards the sub-county is taken from the ward.
WARD_SUBCOUNTY = {"Kiriita": "Ndaragwa", "Weru": "Oljororok", "Charagita": "Oljororok"}

# sheet header -> output column. Anything not listed here is dropped.
KEEP = {
    "id": "register_id", "sol_beneficiary_id": "beneficiary_id", "gender": "gender",
    "birth_year": "birth_year", "age_group": "age_group", "admin_level_1": "county",
    "admin_level_2": "sub_county", "admin_level_3": "ward", "village": "village",
    "cooperative_name": "cooperative", "total_plots": "total_plots",
    "approved_plots": "approved_plots", "rejected_plots": "rejected_plots",
}
INTS = {"birth_year", "total_plots", "approved_plots", "rejected_plots"}


def to_int(v):
    try:
        return int(float(str(v).strip()))
    except ValueError:
        return None


def clean_rows(header, rows):
    idx = {h.strip(): i for i, h in enumerate(header)}
    missing = [h for h in ("sol_beneficiary_id", "admin_level_3") if h not in idx]
    if missing:
        sys.exit(f"profiled register: required columns missing from sheet: {missing}")
    out, seen = [], set()
    for r in rows:
        get = lambda h: (r[idx[h]].strip() if h in idx and idx[h] < len(r) else "")
        bid = get("sol_beneficiary_id").upper()
        if not bid or bid in seen:          # blank spacer rows / duplicate IDs
            continue
        seen.add(bid)
        row = {col: get(h) or None for h, col in KEEP.items()}
        row["beneficiary_id"] = bid
        for c in INTS:
            row[c] = to_int(row[c]) if row[c] is not None else None
        sc = (row["sub_county"] or "").strip()
        row["sub_county"] = SUBCOUNTY_FIX.get(sc.lower(), sc) or None
        row["ward"] = (row["ward"] or "").strip().title() or None
        row["sub_county"] = WARD_SUBCOUNTY.get(row["ward"], row["sub_county"])
        row["county"] = (row["county"] or "").strip().title() or None
        row["village"] = re.sub(r"\s+", " ", (row["village"] or "")).strip().title() or None
        row["in_project_area"] = row["ward"] in PROJECT_WARDS
        row["source_sheet"] = SOURCE
        out.append(row)
    return out


def from_sheet():
    raw = os.environ.get("GOOGLE_CREDENTIALS", "").strip()
    if not raw:
        print("::notice::profiled register skipped — GOOGLE_CREDENTIALS not set; keeping register in Supabase")
        return None
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        info = json.load(open(raw, encoding="utf-8")) if os.path.exists(raw) else json.loads(raw)
        creds = Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
        values = gspread.authorize(creds).open_by_key(SHEET_ID).worksheet(TAB).get_all_values()
    except Exception as e:  # no access yet, renamed tab, API hiccup — never fail the nightly job
        who = locals().get("info", {}).get("client_email", "the service account")
        print(f"::warning::profiled register not refreshed ({type(e).__name__}: {str(e)[:160]}). "
              f"Share the sheet (Viewer) with {who}. Keeping register in Supabase.")
        return None
    return values[0], values[1:]


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--csv":
        with open(sys.argv[2], encoding="utf-8") as fh:
            data = list(csv.reader(fh))
        got = (data[0], data[1:])
    else:
        got = from_sheet()
    path = os.path.join(DDIR, "clean_profiled.json")
    if got is None:
        if os.path.exists(path):
            os.remove(path)               # never load a stale local file by mistake
        return
    rows = clean_rows(*got)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, separators=(",", ":"))
    print(f"profiled register: {len(rows):,} farmers "
          f"({sum(r['in_project_area'] for r in rows):,} in project wards) -> {path}")


if __name__ == "__main__":
    main()
