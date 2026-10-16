"""Pull the SAVE KE measurement framework (logframe KPIs) from Google Sheets and
write clean_framework.json, shaped like save_mf_indicator_values (Sprint 27).

Source: "SAVE Project M&E Framework", tab "dashboard_input" — one row per
indicator x 6-monthly period with numeric total / male / female / youth /
survival-rate columns. The M&E team edits that tab (it is embedded, editable,
in dashboard tab 8); the original "logframe" tab is kept for reference only.
Override with SAVE_MF_SHEET_ID / SAVE_MF_TAB.

Auth: GOOGLE_CREDENTIALS (service account, as fetch_profiled.py). Without
credentials or access it prints a notice and exits 0 WITHOUT writing a file, so
the nightly job keeps the framework already in Supabase.

  python fetch_framework.py               # from Google Sheets
  python fetch_framework.py --csv FILE    # from a local CSV with the same headers
"""
import os, sys, csv, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SAVE_DATA_DIR", HERE)
SHEET_ID = os.environ.get("SAVE_MF_SHEET_ID", "1tAW3zllJ1UYYIbMl5XTqVQhN8MBXrcFRKMm3erD1aN4")
TAB = os.environ.get("SAVE_MF_TAB", "dashboard_input")
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}

NUM_COLS = {"baseline": "baseline", "end_target": "end_target", "total": "total", "male": "male",
            "female": "female", "youth": "youth", "survival_rate_%": "survival_pct"}
TXT_COLS = {"indicator_id": "indicator_id", "level": "level", "indicator": "indicator", "unit": "unit",
            "period": "period_label", "note": "note"}


def num(v):
    s = str(v).strip().replace(",", "").rstrip("%").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def period_end(raw, label):
    """'2024-06' (preferred) — but tolerate Sheets turning it into a date, or only the label."""
    s = str(raw).strip()
    m = re.match(r"^(\d{4})-(\d{1,2})", s)                       # 2024-06 / 2024-06-01
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.match(r"^(\d{1,2})/\d{1,2}/(\d{4})$", s)               # 6/1/2024
    if m:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    m = re.match(r"^([A-Za-z]{3})[a-z]*\s+(\d{4})", (s or str(label)).strip())   # Jun 2024 (6 m)
    if m and m.group(1).lower() in MONTHS:
        return f"{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}"
    return None


def clean_rows(header, rows):
    idx = {h.strip(): i for i, h in enumerate(header)}
    need = ["indicator_id", "indicator", "period_end", "total"]
    if any(h not in idx for h in need):
        sys.exit(f"framework: required columns missing from '{TAB}': {[h for h in need if h not in idx]}")
    cum_col = next((h for h in idx if h.lower().startswith("cumulative")), None)
    out, seen = [], set()
    for r in rows:
        get = lambda h: (r[idx[h]].strip() if h in idx and idx[h] < len(r) else "")
        iid = get("indicator_id")
        pe = period_end(get("period_end"), get("period"))
        if not iid or not pe or (iid, pe) in seen:
            continue
        seen.add((iid, pe))
        row = {col: (get(h) or None) for h, col in TXT_COLS.items()}
        row.update({col: num(get(h)) for h, col in NUM_COLS.items()})
        row["period_end"] = pe
        c = get(cum_col).upper()[:1] if cum_col else ""
        row["cumulative"] = True if c == "Y" else False if c == "N" else None
        out.append(row)
    return out


def from_sheet():
    raw = os.environ.get("GOOGLE_CREDENTIALS", "").strip()
    if not raw:
        print("::notice::framework skipped — GOOGLE_CREDENTIALS not set; keeping framework in Supabase")
        return None
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        info = json.load(open(raw, encoding="utf-8")) if os.path.exists(raw) else json.loads(raw)
        creds = Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
        values = gspread.authorize(creds).open_by_key(SHEET_ID).worksheet(TAB).get_all_values()
    except Exception as e:  # never fail the nightly job over the framework sheet
        who = locals().get("info", {}).get("client_email", "the service account")
        print(f"::warning::framework not refreshed ({type(e).__name__}: {str(e)[:160]}). "
              f"Share the sheet (Viewer) with {who}. Keeping framework in Supabase.")
        return None
    return values[0], values[1:]


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--csv":
        with open(sys.argv[2], encoding="utf-8") as fh:
            data = list(csv.reader(fh))
        got = (data[0], data[1:])
    else:
        got = from_sheet()
    path = os.path.join(DDIR, "clean_framework.json")
    if got is None:
        if os.path.exists(path):
            os.remove(path)
        return
    rows = clean_rows(*got)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"framework: {len({r['indicator_id'] for r in rows})} indicators, {len(rows)} indicator-periods, "
          f"{sum(r['total'] is not None for r in rows)} with a reported total -> {path}")


if __name__ == "__main__":
    main()
