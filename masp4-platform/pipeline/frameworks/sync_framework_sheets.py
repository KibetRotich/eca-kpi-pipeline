"""Nightly sync of project measurement frameworks kept in Google Sheets (Sprint 31).

For every row of project_mf_sheets with source_table = 'project_mf_sheet_values',
read the linked sheet's tidy tab (normally "dashboard_input": one row per
indicator x period) and mirror it into project_mf_sheet_values for that project
(upsert + prune). The /targets project window shows it like Seedlings tab 8.

Columns read by header name (extra columns are ignored):
  indicator_id, level, indicator, unit, baseline, end_target, cumulative (Y/N),
  period_end (YYYY-MM), period, total, male, female, youth, survival_rate_%, note
  optional: target_direct, non_individual

Auth: GOOGLE_CREDENTIALS (service account, as etl.yml) + NEXT_PUBLIC_SUPABASE_URL /
SUPABASE_SERVICE_ROLE_KEY. A sheet the service account cannot open is skipped with
a warning (its last good copy stays in Supabase) and the error is stored in
project_mf_sheets.last_error — one unshared sheet never fails the others.

  python sync_framework_sheets.py                        # all linked sheets
  python sync_framework_sheets.py --project KE-P2P-001 --csv FILE   # one project from a local CSV
"""
import os, sys, csv, json, datetime
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "save_seedlings"))
from load_supabase import _load_env, upsert, select_all, delete_where   # noqa: E402
from fetch_framework import clean_rows, num                              # noqa: E402  (same tidy-tab parser as SAVE)

EXTRA_NUM = {"target_direct": "target_direct", "non_individual": "non_individual"}
TABLE = "project_mf_sheet_values"


def to_rows(project_id, header, rows):
    base = clean_rows(header, rows)                      # indicator_id, period_end, totals, M/F/Y, survival_pct ...
    idx = {h.strip(): i for i, h in enumerate(header)}
    extra = {}
    for r in rows:                                       # optional columns, keyed like clean_rows
        get = lambda h: (r[idx[h]].strip() if h in idx and idx[h] < len(r) else "")
        key = (get("indicator_id"), get("period_end")[:7])
        extra[key] = {col: num(get(h)) for h, col in EXTRA_NUM.items()}
    out = []
    for b in base:
        b = dict(b)
        b.update(extra.get((b["indicator_id"], b["period_end"]), {k: None for k in EXTRA_NUM.values()}))
        b["project_id"] = project_id
        out.append(b)
    return out


def read_sheet(sheet_id, tab):
    import gspread
    from google.oauth2.service_account import Credentials
    raw = os.environ.get("GOOGLE_CREDENTIALS", "").strip()
    if not raw:
        raise RuntimeError("GOOGLE_CREDENTIALS not set")
    info = json.load(open(raw, encoding="utf-8")) if os.path.exists(raw) else json.loads(raw)
    creds = Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    try:
        values = gspread.authorize(creds).open_by_key(sheet_id).worksheet(tab).get_all_values()
    except Exception as e:
        raise RuntimeError(f"{type(e).__name__}: {str(e)[:150]} — share the sheet (Viewer) with {info.get('client_email')}")
    return values[0], values[1:]


def mirror(c, url, key, project_id, rows):
    """Upsert this project's rows and prune indicator-periods no longer in the sheet."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for r in rows:
        r["updated_at"] = now
    if rows:
        upsert(c, url, key, TABLE, rows, "project_id,indicator_id,period_end")
    live = {(r["indicator_id"], r["period_end"]) for r in rows}
    existing = select_all(c, url, key, TABLE, f"indicator_id,period_end&project_id=eq.{project_id}")
    gone = [r for r in existing if (r["indicator_id"], r["period_end"]) not in live] if rows else []
    for r in gone:
        delete_where(c, url, key, TABLE, f"project_id=eq.{project_id}&indicator_id=eq.{r['indicator_id']}"
                                          f"&period_end=eq.{r['period_end']}")
    return len(rows), len(gone)


def stamp(c, url, key, project_id, error):
    hdr = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=minimal"}
    body = {"last_error": error} if error else {"last_error": None,
            "last_synced_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    c.patch(f"{url}/rest/v1/project_mf_sheets?project_id=eq.{project_id}", headers=hdr, content=json.dumps(body))


def main():
    url, key = _load_env()
    with httpx.Client(timeout=120) as c:
        links = select_all(c, url, key, "project_mf_sheets",
                           "project_id,sheet_id,tab,label,projects(project_code)&source_table=eq.project_mf_sheet_values")
        if len(sys.argv) == 5 and sys.argv[1] == "--project" and sys.argv[3] == "--csv":
            link = next((l for l in links if l["projects"]["project_code"] == sys.argv[2]), None)
            if not link:
                sys.exit(f"{sys.argv[2]} has no project_mf_sheets link with source_table=project_mf_sheet_values")
            data = list(csv.reader(open(sys.argv[4], encoding="utf-8")))
            n, gone = mirror(c, url, key, link["project_id"], to_rows(link["project_id"], data[0], data[1:]))
            stamp(c, url, key, link["project_id"], None)
            print(f"{sys.argv[2]}: {n} indicator-periods loaded from CSV, {gone} pruned")
            return
        failures = 0
        for link in links:
            code = link["projects"]["project_code"]
            try:
                header, rows = read_sheet(link["sheet_id"], link["tab"])
                out = to_rows(link["project_id"], header, rows)
                n, gone = mirror(c, url, key, link["project_id"], out)
                stamp(c, url, key, link["project_id"], None)
                print(f"{code}: {len({r['indicator_id'] for r in out})} indicators, {n} indicator-periods, "
                      f"{sum(r['total'] is not None for r in out)} with a value; {gone} pruned")
            except (RuntimeError, SystemExit) as e:
                failures += 1
                stamp(c, url, key, link["project_id"], str(e)[:300])
                print(f"::warning::{code} ({link['label']}) not refreshed — {e}. Keeping its last copy in Supabase.")
        print(f"done: {len(links) - failures}/{len(links)} framework sheets refreshed")


if __name__ == "__main__":
    main()
