"""
Load clean VSLA data into Supabase (PostgREST upsert). Idempotent — safe to re-run
nightly (upsert on natural keys; children keyed so re-runs merge, never duplicate).

Reads transform outputs (clean_*.json) plus the raw Kobo JSON, upserts into the
vsla_* tables, then stamps vsla_sync_meta.

Env (from masp4-platform/.env.local or the CI environment):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, json, sys, datetime
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("VSLA_DATA_DIR", os.path.join(HERE, "data"))
FORM_UID = os.environ.get("VSLA_FORM_UID", "ahxgJ6SKAgF2Pz5tBWC4kp")
BATCH = 500

def _load_env():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        envf = os.path.join(HERE, "..", "..", ".env.local")
        if os.path.exists(envf):
            for line in open(envf, encoding="utf-8"):
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            url = url or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        sys.exit("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")
    return url.rstrip("/"), key

def upsert(url, key, table, rows, on_conflict):
    if not rows:
        print(f"  {table}: 0 (nothing to load)")
        return 0
    hdr = {"apikey": key, "Authorization": f"Bearer {key}",
           "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    n = 0
    with httpx.Client(timeout=120) as c:
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            r = c.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                       headers=hdr, content=json.dumps(chunk, default=str))
            if r.status_code >= 300:
                sys.exit(f"{table} upsert failed [{r.status_code}]: {r.text[:400]}")
            n += len(chunk)
            print(f"  {table}: {n}/{len(rows)}")
    return n

def load(name):
    return json.load(open(os.path.join(DDIR, f"clean_{name}.json"), encoding="utf-8"))

def main():
    url, key = _load_env()
    groups = load("groups")
    metrics = load("metrics")
    qual = load("qualitative")

    # raw landing rows from source JSON
    recs = json.load(open(os.path.join(DDIR, "vsla_raw.json"), encoding="utf-8"))
    recs = recs["results"] if isinstance(recs, dict) and "results" in recs else recs
    raw_rows = [dict(form_uid=FORM_UID, kobo_id=r.get("_id"),
                     submitted_at=r.get("_submission_time"), raw=r) for r in recs]

    print(f"Upserting: raw={len(raw_rows)}, groups={len(groups)}, "
          f"metrics={len(metrics)}, qualitative={len(qual)}")
    upsert(url, key, "vsla_raw_submissions", raw_rows, "kobo_id")
    upsert(url, key, "vsla_groups", groups, "kobo_id")
    upsert(url, key, "vsla_metrics", metrics, "group_kobo_id")
    upsert(url, key, "vsla_qualitative", qual, "group_kobo_id,field_name")

    meta = dict(id=1, last_synced_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                n_groups=len(groups), n_metric_rows=len(metrics), n_qualitative_rows=len(qual),
                notes="pipeline/vsla load")
    hdr = {"apikey": key, "Authorization": f"Bearer {key}",
           "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}
    with httpx.Client(timeout=60) as c:
        c.post(f"{url}/rest/v1/vsla_sync_meta?on_conflict=id", headers=hdr, content=json.dumps([meta]))
    print("done; vsla_sync_meta stamped.")

if __name__ == "__main__":
    main()
