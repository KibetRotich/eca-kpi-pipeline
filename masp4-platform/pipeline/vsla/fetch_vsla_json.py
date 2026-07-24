"""
Fetch ALL submissions for the "VSLA PERFORMANCE ASSESSMENT TOOL" from
KoBoToolbox (JSON data API) plus the form definition (survey + choices) used to
decode choice codes -> labels in transform.py.

Writes into pipeline/vsla/data/:
  vsla_raw.json      (all submissions, group-prefixed columns)
  vsla_formdef.json  (XLSForm survey+choices, for code->label decode)

Env: KOBO_TOKEN (KoBoToolbox API token). Paginates at 1000 (server cap).
Mirrors pipeline/cva/fetch_cva_json.py exactly (same convention).
"""
import os, sys, json
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required")
BASE = os.environ.get("KOBO_BASE", "https://kf.kobotoolbox.org")
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("VSLA_DATA_DIR", os.path.join(HERE, "data"))
os.makedirs(DDIR, exist_ok=True)

FORM_UID = os.environ.get("VSLA_FORM_UID", "ahxgJ6SKAgF2Pz5tBWC4kp")   # VSLA PERFORMANCE ASSESSMENT TOOL
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
    print("Fetching VSLA submissions…")
    json.dump(fetch_all(FORM_UID), open(os.path.join(DDIR, "vsla_raw.json"), "w", encoding="utf-8"))
    print("Fetching VSLA form definition…")
    json.dump(fetch_formdef(FORM_UID), open(os.path.join(DDIR, "vsla_formdef.json"), "w", encoding="utf-8"))
    print("done.")

if __name__ == "__main__":
    main()
