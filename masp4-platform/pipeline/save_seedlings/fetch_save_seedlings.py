"""Pull ALL submissions for the SAVE KE Seedlings Distribution form via the JSON
data API and build two clean, version-robust tables:

  save_dist_main.csv     - one row per distribution event (submission)
  save_dist_farmers.csv  - one row per farmer entry from the farmer_details repeat
  save_dist_raw.json     - the submissions themselves, PII stripped (for save_dist_raw_submissions)

Fields are keyed on their LAST path segment (farmer_details/cordia_count ->
cordia_count) so group renames across form versions don't break the pipeline.

PII policy: farmer names and phone numbers are NOT written to disk (nor to the raw
JSON) — only the pseudonymous Solidaridad beneficiary ID / ref no. are kept.
"""
import os
import csv
import json
import sys
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required "
             "(KoBoToolbox API token for form ar7ZyJqG8qJ9sUu4JLWiTY)")
BASE = os.environ.get("KOBO_URL", "https://kf.kobotoolbox.org").rstrip("/")
UID = "ar7ZyJqG8qJ9sUu4JLWiTY"
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
# CSVs are written next to this script (gitignored) unless SAVE_DATA_DIR overrides.
DDIR = os.environ.get("SAVE_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))

MAIN_FIELDS = [
    "real_test_submission", "admin_level_2", "admin_level_3", "admin_level_4",
    "location", "application_start", "application_end",
    "enumarator_names", "comments_questions",
]
META_FIELDS = ["_id", "_uuid", "_submission_time", "__version__"]
SPECIES = ["cordia", "bamboo", "grivellea", "dombeya", "sesbania",
           "calliandra", "azadirachta", "avocado", "apple"]
FARMER_FIELDS = [
    "farmer_ref_no", "farmer__sol_beneficiary_id", "farmer__admin_level_2",
    "farmer__admin_level_3", "farmer__village", "farmer__cooperative_name",
    "farmer__seedlings_given", "farmer__seedlings_given_total",
    "total_seedlings_calculated", "total_seedlings_given",
] + [f"{s}_count" for s in SPECIES]

# Register look-ups copied into each repeat entry that identify a person — dropped everywhere
PII_SEGMENTS = {"farmer__names", "farmer__phone_number", "farmer__enumerator_names"}
SKIP_LIST_KEYS = {"_attachments", "_geolocation", "_notes", "_validation_status", "_tags"}


def last_seg(key):
    return key.split("/")[-1]


def strip_pii(o):
    if isinstance(o, dict):
        return {k: strip_pii(v) for k, v in o.items() if last_seg(k) not in PII_SEGMENTS}
    if isinstance(o, list):
        return [strip_pii(v) for v in o]
    return o


def normalize(sub):
    """Return (main_row, [farmer_rows]) for one submission."""
    main, farmers = {}, []
    sid = sub.get("_id")
    for k, v in sub.items():
        if k in META_FIELDS:
            main[k] = v
            continue
        if k in SKIP_LIST_KEYS:
            continue
        if isinstance(v, list) and v and isinstance(v[0], dict):
            for i, entry in enumerate(v):
                row = {"_id": sid, "entry_no": i + 1}
                for ek, ev in entry.items():
                    seg = last_seg(ek)
                    if seg in FARMER_FIELDS:
                        row[seg] = ev
                farmers.append(row)
            continue
        if isinstance(v, (list, dict)):
            continue
        seg = last_seg(k)
        if seg == "comments_questions_001":
            seg = "comments_questions"
        if seg in MAIN_FIELDS:
            main[seg] = v
    main["n_farmers"] = len(farmers)
    return main, farmers


def main():
    main_rows, farmer_rows, raw = [], [], []
    start, limit, total = 0, 5000, None
    while True:
        url = f"{BASE}/api/v2/assets/{UID}/data/?format=json&limit={limit}&start={start}"
        r = httpx.get(url, headers=HEADERS,
                      timeout=httpx.Timeout(connect=15, read=180, write=30, pool=10))
        r.raise_for_status()
        data = r.json()
        if total is None:
            total = data.get("count")
            print(f"Total submissions reported: {total:,}", flush=True)
        page = data.get("results", [])
        if not page:
            break
        for sub in page:
            raw.append(strip_pii(sub))
            m, fs = normalize(sub)
            main_rows.append(m)
            farmer_rows.extend(fs)
        start += len(page)
        print(f"  fetched {start:,}/{total:,}  (farmer entries so far: {len(farmer_rows):,})", flush=True)
        if start >= total:
            break

    # Completeness assertion — do NOT silently truncate
    print(f"\nFetched {len(main_rows):,} submissions, expected {total:,}", flush=True)
    if len(main_rows) != total:
        print(f"  WARNING: count mismatch ({len(main_rows)} != {total})", flush=True)

    main_path = os.path.join(DDIR, "save_dist_main.csv")
    farmer_path = os.path.join(DDIR, "save_dist_farmers.csv")
    with open(main_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=META_FIELDS + MAIN_FIELDS + ["n_farmers"], extrasaction="ignore")
        w.writeheader()
        w.writerows(main_rows)
    with open(farmer_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["_id", "entry_no"] + FARMER_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(farmer_rows)

    raw_path = os.path.join(DDIR, "save_dist_raw.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw, f, separators=(",", ":"))

    print("\nWROTE:", flush=True)
    print(f"  {raw_path}  ({len(raw):,} submissions, PII stripped)", flush=True)
    print(f"  {main_path}  ({len(main_rows):,} rows)", flush=True)
    print(f"  {farmer_path}  ({len(farmer_rows):,} rows)", flush=True)


if __name__ == "__main__":
    main()
