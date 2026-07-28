"""Kobo -> Supabase sync for the Cool Farm (CFP) analytics store.

    python pipeline/sync_supabase.py --full          # backfill everything
    python pipeline/sync_supabase.py                 # incremental
    python pipeline/sync_supabase.py --from-file data/raw/submissions.json

Incremental strategy
--------------------
Kobo is queried with a `_submission_time >= high-water-mark` filter, where the
mark comes from cfp_sync_meta.last_submitted_at minus an overlap window
(default 2 days). The overlap exists because Kobo submissions can be *edited*
after the fact -- an edit keeps the same `_id`, so an id-only high-water mark
would silently miss it. Reprocessing a small overlap every run is cheap and
idempotent (parents upsert on kobo_id; children are deleted then reinserted for
exactly the submissions in scope).

`--full` re-reads every submission. Use it after changing transform.py, since
derived columns are computed at load time, not query time.

Env (falls back to masp4-platform/.env.local):
    KOBO_TOKEN, KOBO_URL
    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from transform import transform_submission, PII_FIELDS  # noqa: E402

FORM_UID = "a4AC6PCXs4QFs3KBym8KKS"
OVERLAP_DAYS = 2
PAGE = 1000
BATCH = 500

CHILD_TABLES = (
    "cfp_residue_fates", "cfp_yield_curve", "cfp_fertilizer_applications",
    "cfp_pesticide_applications", "cfp_energy_use", "cfp_irrigation_use",
    "cfp_transport_use", "cfp_intercrops", "cfp_shade_trees", "cfp_hedges",
    "cfp_wastewater_treatments", "cfp_land_use_change", "cfp_dq_flags",
)


# --- config -----------------------------------------------------------
def load_env():
    """Collect env vars, back-filling from the nearest .env.local found upward.

    Walks up from this file's directory so the script works whether it lives in
    `masp4-platform/pipeline/coolfarm/` or a standalone `coolfarm/pipeline/`.
    Real environment variables always win over file values.
    """
    env = dict(os.environ)
    here = os.path.dirname(os.path.abspath(__file__))
    seen = []
    for _ in range(6):
        for name in (".env.local", ".env"):
            seen.append(os.path.join(here, name))
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    for p in seen:
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", line)
            if m and m.group(1) not in env:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


ENV = load_env()
SB_URL = (ENV.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SB_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY")
KOBO_URL = (ENV.get("KOBO_URL") or "https://kf.kobotoolbox.org").rstrip("/")
KOBO_TOKEN = ENV.get("KOBO_TOKEN")


def req(url, method="GET", body=None, headers=None, timeout=180, want_headers=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            parsed = json.loads(raw) if raw else None
            return (parsed, dict(resp.headers)) if want_headers else parsed
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} {method} {url.split('?')[0]}\n{e.read().decode()[:900]}")


def sb_count(table):
    """Exact row count via the Content-Range header.

    A plain `select=...` response is capped at PostgREST's max-rows (1000 here),
    so len() of the body silently under-reports on larger tables.
    """
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
         "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}
    _, hdrs = req(f"{SB_URL}/rest/v1/{table}?select=*", "GET", None, h,
                  want_headers=True)
    rng = hdrs.get("Content-Range", "")
    return int(rng.split("/")[-1]) if "/" in rng else None


def sb(path, method="GET", body=None, prefer=None, timeout=180):
    h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
         "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return req(f"{SB_URL}/rest/v1/{path}", method, body, h, timeout)


# --- extract ----------------------------------------------------------
def fetch_kobo(since=None):
    rows, start, total = [], 0, None
    q = ""
    if since:
        query = json.dumps({"_submission_time": {"$gte": since}})
        q = "&query=" + urllib.parse.quote(query)
    while True:
        url = (f"{KOBO_URL}/api/v2/assets/{FORM_UID}/data/"
               f"?format=json&start={start}&limit={PAGE}{q}")
        batch = req(url, headers={"Authorization": f"Token {KOBO_TOKEN}",
                                  "Accept": "application/json"})
        got = batch.get("results", [])
        total = batch.get("count", total)
        rows.extend(got)
        print(f"  kobo +{len(got)} (total {len(rows)} / {total})")
        # Kobo caps a page at 1000 regardless of `limit`, so page size cannot be
        # the termination signal -- drive off `count`.
        if not got or (total is not None and len(rows) >= total):
            break
        start += len(got)
    return rows


def strip_pii(raw):
    """Remove name/phone before the verbatim JSON is persisted."""
    out = {}
    for k, v in raw.items():
        base = k.split("/")[-1].split("__")[-1]
        if base in PII_FIELDS or k.endswith("instanceName"):
            continue
        out[k] = v
    return out


# --- load -------------------------------------------------------------
def chunks(seq, n=BATCH):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def upsert(table, rows, on_conflict, returning=False):
    if not rows:
        return []
    out = []
    prefer = "resolution=merge-duplicates," + ("return=representation"
                                               if returning else "return=minimal")
    for c in chunks(rows):
        res = sb(f"{table}?on_conflict={on_conflict}", "POST", c, prefer)
        if returning and res:
            out.extend(res)
    return out


def insert(table, rows):
    for c in chunks(rows):
        sb(table, "POST", c, "return=minimal")


def delete_children(sub_ids):
    """Clear child rows for the submissions in scope, so a re-run is idempotent."""
    for table in CHILD_TABLES:
        for c in chunks(sub_ids, 150):
            ids = ",".join(c)
            sb(f"{table}?submission_id=in.({ids})", "DELETE", None, "return=minimal")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="reprocess every submission")
    ap.add_argument("--from-file", help="read submissions from a local JSON file")
    ap.add_argument("--dry-run", action="store_true", help="transform only, no writes")
    args = ap.parse_args()

    if not args.dry_run and not (SB_URL and SB_KEY):
        sys.exit("Supabase URL / service role key not found")

    # ---- extract -----------------------------------------------------
    if args.from_file:
        print(f"reading {args.from_file}")
        raw_rows = json.load(open(args.from_file, encoding="utf-8"))
    else:
        if not KOBO_TOKEN:
            sys.exit("KOBO_TOKEN not set")
        since = None
        if not args.full:
            meta = sb("cfp_sync_meta?id=eq.1&select=last_submitted_at")
            hw = (meta or [{}])[0].get("last_submitted_at")
            if hw:
                dt = datetime.fromisoformat(hw.replace("Z", "+00:00"))
                since = (dt - timedelta(days=OVERLAP_DAYS)).strftime("%Y-%m-%dT%H:%M:%S")
                print(f"incremental since {since} (high-water {hw} - {OVERLAP_DAYS}d)")
            else:
                print("no high-water mark -- falling back to full fetch")
        else:
            print("full fetch")
        raw_rows = fetch_kobo(since)

    if not raw_rows:
        print("nothing to sync")
        return

    # ---- transform ---------------------------------------------------
    print(f"transforming {len(raw_rows)} submissions ...")
    results, parents = [], []
    for r in raw_rows:
        t = transform_submission(r)
        if t["parent"]["kobo_id"] is None:
            continue
        results.append(t)
        parents.append(t["parent"])
    print(f"  {len(parents)} parents, "
          f"{sum(len(x['children']['cfp_residue_fates']) for x in results)} residue rows, "
          f"{sum(len(x['flags']) for x in results)} dq flags")

    if args.dry_run:
        print("dry run -- no writes")
        return

    # ---- raw landing zone (PII stripped) -----------------------------
    print("loading cfp_raw_submissions ...")
    upsert("cfp_raw_submissions",
           [{"form_uid": FORM_UID, "kobo_id": r.get("_id"),
             "submitted_at": r.get("_submission_time"),
             "raw": strip_pii(r)} for r in raw_rows if r.get("_id")],
           "kobo_id")

    # ---- parents -----------------------------------------------------
    print("upserting cfp_submissions ...")
    returned = upsert("cfp_submissions", parents, "kobo_id", returning=True)
    id_by_kobo = {r["kobo_id"]: r["submission_id"] for r in returned}
    missing = [p["kobo_id"] for p in parents if p["kobo_id"] not in id_by_kobo]
    if missing:
        # Rows that already existed and were merged still come back in the
        # representation, so this should be empty; fetch defensively if not.
        for c in chunks(missing, 200):
            got = sb(f"cfp_submissions?kobo_id=in.({','.join(str(i) for i in c)})"
                     "&select=kobo_id,submission_id")
            id_by_kobo.update({r["kobo_id"]: r["submission_id"] for r in got or []})

    sub_ids = [id_by_kobo[p["kobo_id"]] for p in parents if p["kobo_id"] in id_by_kobo]
    print(f"  {len(sub_ids)} submission ids resolved")

    # ---- children (delete-then-insert for the scoped submissions) ----
    print("clearing existing child rows for scoped submissions ...")
    delete_children(sub_ids)

    buckets = {t: [] for t in CHILD_TABLES}
    for t in results:
        sid = id_by_kobo.get(t["parent"]["kobo_id"])
        if not sid:
            continue
        for table, rows in t["children"].items():
            for row in rows:
                buckets[table].append({"submission_id": sid, **row})
        for f in t["flags"]:
            buckets["cfp_dq_flags"].append({"submission_id": sid, **f})

    for table in CHILD_TABLES:
        rows = buckets[table]
        if rows:
            print(f"  {table}: {len(rows)}")
            insert(table, rows)

    # ---- bookkeeping -------------------------------------------------
    max_kobo = max((p["kobo_id"] for p in parents), default=None)
    max_time = max((p["submitted_at"] for p in parents if p["submitted_at"]), default=None)
    total_in_store = sb_count("cfp_submissions")
    sb("cfp_sync_meta?id=eq.1", "PATCH", {
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "last_kobo_id": max_kobo,
        "last_submitted_at": max_time,
        "n_submissions": total_in_store,
        "n_residue_rows": len(buckets["cfp_residue_fates"]),
        "n_yield_rows": len(buckets["cfp_yield_curve"]),
        "n_fertilizer_rows": len(buckets["cfp_fertilizer_applications"]),
        "n_pesticide_rows": len(buckets["cfp_pesticide_applications"]),
        "n_transport_rows": len(buckets["cfp_transport_use"]),
        "n_agroforestry_rows": (len(buckets["cfp_intercrops"])
                                + len(buckets["cfp_shade_trees"])
                                + len(buckets["cfp_hedges"])),
        "n_landuse_rows": len(buckets["cfp_land_use_change"]),
        "n_dq_flags": len(buckets["cfp_dq_flags"]),
        "notes": ("full backfill" if args.full or args.from_file else "incremental")
                 + f"; {len(parents)} submissions in scope",
    }, "return=minimal")

    print(f"done. {len(parents)} submissions synced, {total_in_store} total in store.")


if __name__ == "__main__":
    main()
