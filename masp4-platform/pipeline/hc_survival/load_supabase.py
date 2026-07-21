"""
Load clean HC/SAVE tree-survival data into Supabase (PostgREST upsert).

Reads the transform outputs (clean_submissions.json, clean_species.json) plus the
raw Kobo JSON, and upserts into hcs_raw_submissions / hcs_submissions / hcs_species,
then stamps hcs_sync_meta. Idempotent (upsert on the natural keys).

Env (from masp4-platform/.env.local or the CI environment):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, json, sys, datetime
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("HCS_DATA_DIR", os.path.join(HERE, "data"))
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
    if not rows: return 0
    hdr = {"apikey": key, "Authorization": f"Bearer {key}",
           "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    n = 0
    with httpx.Client(timeout=120) as c:
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i+BATCH]
            r = c.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                       headers=hdr, content=json.dumps(chunk, default=str))
            if r.status_code >= 300:
                sys.exit(f"{table} upsert failed [{r.status_code}]: {r.text[:400]}")
            n += len(chunk)
            print(f"  {table}: {n}/{len(rows)}")
    return n

def main():
    url, key = _load_env()
    sub = json.load(open(os.path.join(DDIR, "clean_submissions.json"), encoding="utf-8"))
    spc = json.load(open(os.path.join(DDIR, "clean_species.json"), encoding="utf-8"))

    # raw landing rows (from source JSON)
    raw_rows = []
    for fn, cohort, uid in [("form1_raw.json", "UG_HC", "aVfWPw45B9gB46AEJXVHwS"),
                            ("form2_raw.json", "KE_SAVE", "ahSMK3J7qQngQnXd76JkzF")]:
        recs = json.load(open(os.path.join(DDIR, fn), encoding="utf-8"))
        recs = recs["results"] if isinstance(recs, dict) and "results" in recs else recs
        for r in recs:
            raw_rows.append(dict(cohort=cohort, form_uid=uid, kobo_id=r.get("_id"),
                                 submitted_at=r.get("_submission_time"), raw=r))

    print(f"Upserting raw={len(raw_rows)}, submissions={len(sub)}, species={len(spc)}")
    upsert(url, key, "hcs_raw_submissions", raw_rows, "cohort,kobo_id")
    upsert(url, key, "hcs_submissions", sub, "cohort,kobo_id")
    upsert(url, key, "hcs_species", spc, "submission_kobo_id,species_idx")

    # sync meta
    hdr = {"apikey": key, "Authorization": f"Bearer {key}",
           "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"}
    meta = dict(id=1, last_synced_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                form1_submissions=sum(1 for x in sub if x["cohort"] == "UG_HC"),
                form2_submissions=sum(1 for x in sub if x["cohort"] == "KE_SAVE"),
                form2_species=len(spc), notes="pipeline/hc_survival load")
    with httpx.Client(timeout=60) as c:
        c.post(f"{url}/rest/v1/hcs_sync_meta?on_conflict=id", headers=hdr, content=json.dumps([meta]))
    print("done; sync_meta stamped.")

if __name__ == "__main__":
    main()
