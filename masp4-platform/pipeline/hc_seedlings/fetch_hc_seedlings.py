"""Pull ALL submissions of the Harvesting Carbon (Uganda) Agroforestry Seedling Distribution form
(Kobo asset afH6NHNNZmVHQfCnuxGx3p) and write them, PII stripped, to hc_dist_raw.json (gitignored).

One submission = one farmer receiving seedlings. Fields are later keyed on their LAST path segment
(farmers_location/district -> district) so group renames across form versions don't break anything.

PII policy: the farmer's name and phone number are dropped here and never reach disk or Supabase.
The farmer code, staff and enumerator names are kept for the staff-only tables; the dashboard
embeds counts and codes only.
"""
import os, sys, json
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required (KoBoToolbox API token for afH6NHNNZmVHQfCnuxGx3p)")
BASE = os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org").rstrip("/")
UID = "afH6NHNNZmVHQfCnuxGx3p"
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
DDIR = os.environ.get("HC_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))

PII_SEGMENTS = {"farmers_name", "farmers_contact"}
SKIP_KEYS = {"_attachments", "_notes", "_validation_status", "_tags"}


def strip(sub):
    return {k: v for k, v in sub.items() if k.split("/")[-1] not in PII_SEGMENTS and k not in SKIP_KEYS}


def main():
    raw, start, limit, total = [], 0, 1000, None
    while True:
        r = httpx.get(f"{BASE}/api/v2/assets/{UID}/data/?format=json&limit={limit}&start={start}",
                      headers=HEADERS, timeout=httpx.Timeout(connect=15, read=180, write=30, pool=10))
        r.raise_for_status()
        data = r.json()
        total = data.get("count") if total is None else total
        page = data.get("results", [])
        if not page:
            break
        raw += [strip(s) for s in page]
        start += len(page)
        if start >= total:
            break
    print(f"Fetched {len(raw):,} submissions (Kobo reports {total:,})")
    if len(raw) != total:
        print(f"  WARNING: count mismatch ({len(raw)} != {total})")
    with open(os.path.join(DDIR, "hc_dist_raw.json"), "w", encoding="utf-8") as f:
        json.dump(raw, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
