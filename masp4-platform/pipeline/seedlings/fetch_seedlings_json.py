"""Pull ALL submissions for the UG Seedlings Application form via the JSON data
API and build two clean, version-robust tables:

  seedlings_main.csv   - one row per submission (fields resolved by last path segment)
  seedlings_items.csv  - one row per species line-item from the request_items repeat

Field names are group-prefixed and vary across form versions, so we key every
field on its LAST path segment (general_details/region -> region).
"""
import os
import csv
import sys
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required "
             "(KoBoToolbox API token for form a5rJdqQGuy2DtTXvEx3cpq)")
BASE  = "https://kf.kobotoolbox.org"
UID   = "a5rJdqQGuy2DtTXvEx3cpq"
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
# CSVs are written next to this script (gitignored) unless SEEDLINGS_DATA_DIR overrides.
DDIR  = os.environ.get("SEEDLINGS_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))

# Scalar fields we keep on the main table (matched on last path segment)
MAIN_FIELDS = [
    "region", "district", "cooperative", "other_cooperatives", "project",
    "application_location", "application_start", "application_end",
    "have_farmer_id", "farmer_id", "manual_farmer_id", "no_farmer_id_reason",
    "farmer_names", "farmer_national_id", "telephone_number",
    "farmer__sol_beneficiary_id", "farmer__already_applied",
    "total_seedlings", "total_seedlings_cost", "facilitation_cost",
    "transport_cost", "grand_total",
    "witness_names", "witness_national_id", "witness_phone_number", "witness_date",
    "form_photo_page_1", "form_photo_page_2", "form_photo_page_3", "form_photo_page_4",
    "enumerator", "enumarator_names", "enumarator_names_other",
    "suggested_seedlings", "comments_questions_001",
]
META_FIELDS = ["_id", "_uuid", "_submission_time", "_submitted_by", "__version__"]
ITEM_FIELDS = ["advance_item", "advance_item_quantity", "other_species_name", "total_line_cost"]

SKIP_LIST_KEYS = {"_attachments", "_geolocation", "_notes", "_validation_status", "_tags"}


def last_seg(key):
    return key.split("/")[-1]


def normalize(sub):
    """Return (main_row, [item_rows]) for one submission."""
    main = {}
    items = []
    sid = sub.get("_id")
    for k, v in sub.items():
        if k in META_FIELDS:
            main[k] = v
            continue
        if k in SKIP_LIST_KEYS:
            continue
        # repeat group: a list of dicts whose entries describe seedling line items
        if isinstance(v, list) and v and isinstance(v[0], dict):
            for entry in v:
                row = {"_id": sid}
                for ek, ev in entry.items():
                    seg = last_seg(ek)
                    if seg in ITEM_FIELDS:
                        row[seg] = ev
                if any(row.get(f) not in (None, "") for f in ITEM_FIELDS):
                    items.append(row)
            continue
        if isinstance(v, (list, dict)):
            continue
        seg = last_seg(k)
        if seg in MAIN_FIELDS:
            main[seg] = v  # last-write-wins across duplicate concepts is fine
    return main, items


def main():
    main_rows, item_rows = [], []
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
            m, its = normalize(sub)
            main_rows.append(m)
            item_rows.extend(its)
        start += len(page)
        print(f"  fetched {start:,}/{total:,}  (items so far: {len(item_rows):,})", flush=True)
        if start >= total:
            break

    # Completeness assertion — do NOT silently truncate
    print(f"\nFetched {len(main_rows):,} submissions, expected {total:,}", flush=True)
    if len(main_rows) != total:
        print(f"  WARNING: count mismatch ({len(main_rows)} != {total})", flush=True)

    main_path = os.path.join(DDIR, "seedlings_main.csv")
    item_path = os.path.join(DDIR, "seedlings_items.csv")

    main_cols = META_FIELDS + MAIN_FIELDS
    with open(main_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=main_cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(main_rows)

    with open(item_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["_id"] + ITEM_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(item_rows)

    print(f"\nWROTE:", flush=True)
    print(f"  {main_path}  ({len(main_rows):,} rows)", flush=True)
    print(f"  {item_path}  ({len(item_rows):,} rows)", flush=True)


if __name__ == "__main__":
    main()
