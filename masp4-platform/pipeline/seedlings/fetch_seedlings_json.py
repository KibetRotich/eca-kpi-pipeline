"""Pull ALL submissions for the UG Seedlings Application AND Distribution forms via
the JSON data API and build clean, version-robust tables:

  seedlings_main.csv          - one row per application (fields resolved by last path segment)
  seedlings_items.csv         - one row per species line-item from the request_items repeat
  seedlings_dist_events.csv   - one row per distribution submission (a distribution event)
  seedlings_dist_entries.csv  - one row per farmer in the distribution farmer_details repeat

Field names are group-prefixed and vary across form versions, so we key every
field on its LAST path segment (general_details/region -> region).

PII policy: farmer names, national IDs, phones, addresses and all witness details
are NOT written to disk. Only presence flags (has_national_id, has_witness) and the
pseudonymous Solidaridad beneficiary / farmer IDs are kept.
"""
import os
import csv
import sys
import httpx

TOKEN = os.environ.get("KOBO_TOKEN")
if not TOKEN:
    sys.exit("KOBO_TOKEN environment variable is required "
             "(KoBoToolbox API token for forms a5rJdqQGuy2DtTXvEx3cpq + aGXzNqEgZhjXazLmLPVpMn)")
BASE  = "https://kf.kobotoolbox.org"
UID   = "a5rJdqQGuy2DtTXvEx3cpq"        # UG Seedlings Application
DIST_UID = "aGXzNqEgZhjXazLmLPVpMn"     # UG Seedlings Distribution
HEADERS = {"Authorization": f"Token {TOKEN}", "Accept": "application/json"}
# CSVs are written next to this script (gitignored) unless SEEDLINGS_DATA_DIR overrides.
DDIR  = os.environ.get("SEEDLINGS_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))

# Scalar fields we keep on the main table (matched on last path segment)
MAIN_FIELDS = [
    "region", "district", "cooperative", "other_cooperatives", "project",
    "application_location", "application_start", "application_end",
    "have_farmer_id", "farmer_id", "manual_farmer_id", "no_farmer_id_reason",
    "farmer__sol_beneficiary_id", "farmer__already_applied",
    "total_seedlings", "total_seedlings_cost", "facilitation_cost",
    "transport_cost", "grand_total", "witness_date",
    "form_photo_page_1", "form_photo_page_2", "form_photo_page_3", "form_photo_page_4",
    "enumerator", "enumarator_names", "enumarator_names_other",
    "suggested_seedlings", "comments_questions_001",
]
# Derived from PII fields, which are then dropped
FLAG_FIELDS = ["has_national_id", "has_witness"]
META_FIELDS = ["_id", "_uuid", "_submission_time", "_submitted_by", "__version__"]
ITEM_FIELDS = ["advance_item", "advance_item_quantity", "other_species_name", "total_line_cost"]

DIST_MAIN_FIELDS = ["real_test_submission", "admin_level_0", "admin_level_1", "admin_level_2",
                    "location", "distribution_name", "application_start", "application_end",
                    "enumarator_names", "comments_questions2"]
DIST_ENTRY_FIELDS = ["sub_id__farmer_id", "farmer__loan_application_ref", "farmer__sol_beneficiary_id",
                     "farmer__admin_level_2", "farmer__admin_level_3", "farmer__cooperative_name",
                     "farmer__seedlings_applied_total", "farmer__seedlings_applied_cost",
                     "farmer__seedlings_given", "total_seedlings_given"]

SKIP_LIST_KEYS = {"_attachments", "_geolocation", "_notes", "_validation_status", "_tags"}
PLACE = {"", "0", "00", "000", "0000", "00000", "000000", "na", "n/a", "none",
         "nil", "null", "-", ".", "x", "xx", "no", "ni", "yed", "n /a", "n.a"}


def last_seg(key):
    return key.split("/")[-1]


def present(v):
    return v is not None and str(v).strip().lower() not in PLACE


def normalize(sub):
    """Return (main_row, [item_rows]) for one application submission."""
    main = {}
    items = []
    nid = wit = False
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
        if seg == "farmer_national_id":
            nid = nid or present(v)
        elif seg in ("witness_names", "witness_national_id"):
            wit = wit or present(v)
        elif seg in MAIN_FIELDS:
            main[seg] = v  # last-write-wins across duplicate concepts is fine
    main["has_national_id"] = nid
    main["has_witness"] = wit
    return main, items


def normalize_dist(sub):
    """Return (event_row, [entry_rows]) for one distribution submission."""
    ev = {k: sub.get(k) for k in META_FIELDS}
    entries = []
    for k, v in sub.items():
        if k in META_FIELDS or k in SKIP_LIST_KEYS:
            continue
        if isinstance(v, list) and v and isinstance(v[0], dict):
            for i, entry in enumerate(v, 1):
                row = {"_id": sub.get("_id"), "entry_no": i}
                for ek, evv in entry.items():
                    seg = last_seg(ek)
                    if seg in DIST_ENTRY_FIELDS:
                        row[seg] = evv
                entries.append(row)
            continue
        if isinstance(v, (list, dict)):
            continue
        seg = last_seg(k)
        if seg in DIST_MAIN_FIELDS:
            ev[seg] = v
    return ev, entries


def fetch_all(uid):
    out, start, total = [], 0, None
    while True:
        url = f"{BASE}/api/v2/assets/{uid}/data/?format=json&limit=5000&start={start}"
        r = httpx.get(url, headers=HEADERS,
                      timeout=httpx.Timeout(connect=15, read=180, write=30, pool=10))
        r.raise_for_status()
        data = r.json()
        if total is None:
            total = data.get("count")
            print(f"[{uid}] total submissions reported: {total:,}", flush=True)
        page = data.get("results", [])
        if not page:
            break
        out.extend(page)
        start += len(page)
        print(f"  fetched {start:,}/{total:,}", flush=True)
        if start >= total:
            break
    # Completeness assertion — do NOT silently truncate
    if len(out) != total:
        print(f"  WARNING: count mismatch ({len(out)} != {total})", flush=True)
    return out


def write_csv(name, cols, rows):
    path = os.path.join(DDIR, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"  {path}  ({len(rows):,} rows)", flush=True)


def main():
    main_rows, item_rows = [], []
    for sub in fetch_all(UID):
        m, its = normalize(sub)
        main_rows.append(m)
        item_rows.extend(its)

    ev_rows, en_rows = [], []
    for sub in fetch_all(DIST_UID):
        ev, ens = normalize_dist(sub)
        ev_rows.append(ev)
        en_rows.extend(ens)

    print("\nWROTE:", flush=True)
    write_csv("seedlings_main.csv", META_FIELDS + MAIN_FIELDS + FLAG_FIELDS, main_rows)
    write_csv("seedlings_items.csv", ["_id"] + ITEM_FIELDS, item_rows)
    write_csv("seedlings_dist_events.csv", META_FIELDS + DIST_MAIN_FIELDS, ev_rows)
    write_csv("seedlings_dist_entries.csv", ["_id", "entry_no"] + DIST_ENTRY_FIELDS, en_rows)


if __name__ == "__main__":
    main()
