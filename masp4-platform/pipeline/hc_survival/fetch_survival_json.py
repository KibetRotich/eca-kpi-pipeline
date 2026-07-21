"""
Fetch ALL submissions for both tree-survival forms from KoBoToolbox (JSON data
API — preserves Form 2's per-species repeat group, which the flat CSV export
collapses) plus Form 2's form definition (for choice decoding).

Writes into pipeline/hc_survival/data/:
  form1_raw.json      (Uganda / Harvesting Carbon — batch grain)
  form2_raw.json      (Kenya / SAVE KE — species repeat grain)
  form2_formdef.json  (XLSForm survey+choices, for code->label decode)

Env: KOBO_TOKEN (KoBoToolbox API token). Paginates at 1000 (server cap).
"""
import os, sys, json
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required")
BASE = os.environ.get("KOBO_BASE", "https://kf.kobotoolbox.org")
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("HCS_DATA_DIR", os.path.join(HERE, "data"))
os.makedirs(DDIR, exist_ok=True)

FORM1_UID = "aVfWPw45B9gB46AEJXVHwS"   # Harvesting Carbon — Uganda
FORM2_UID = "ahSMK3J7qQngQnXd76JkzF"   # SAVE KE — Kenya
PAGE = 1000

def fetch_all(uid):
    rows, start = [], 0
    with httpx.Client(timeout=180, headers=HEADERS) as c:
        while True:
            r = c.get(f"{BASE}/api/v2/assets/{uid}/data.json",
                      params={"limit": PAGE, "start": start})
            r.raise_for_status()
            j = r.json()
            batch = j.get("results", j if isinstance(j, list) else [])
            rows.extend(batch)
            print(f"  {uid}: {len(rows)}/{j.get('count','?')}")
            if len(batch) < PAGE:
                break
            start += PAGE
    return rows

def fetch_formdef(uid):
    with httpx.Client(timeout=120, headers=HEADERS) as c:
        r = c.get(f"{BASE}/api/v2/assets/{uid}/", params={"format": "json"})
        r.raise_for_status()
        return r.json().get("content", {})

def main():
    print("Fetching Form 1 (UG / Harvesting Carbon)…")
    json.dump(fetch_all(FORM1_UID), open(os.path.join(DDIR, "form1_raw.json"), "w", encoding="utf-8"))
    print("Fetching Form 2 (KE / SAVE KE)…")
    json.dump(fetch_all(FORM2_UID), open(os.path.join(DDIR, "form2_raw.json"), "w", encoding="utf-8"))
    print("Fetching Form 2 definition…")
    json.dump(fetch_formdef(FORM2_UID), open(os.path.join(DDIR, "form2_formdef.json"), "w", encoding="utf-8"))
    print("done.")

if __name__ == "__main__":
    main()
