"""Load clean Harvesting Carbon distribution data into Supabase (PostgREST upsert). Idempotent: upserts
on kobo_id, then prunes rows whose Kobo submission no longer exists, so the tables mirror the form.

Env (from masp4-platform/.env.local or the CI environment):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, sys, json, datetime
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("HC_DATA_DIR", HERE)
FORM_UID = "afH6NHNNZmVHQfCnuxGx3p"
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


def _hdr(key, prefer="resolution=merge-duplicates,return=minimal"):
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": prefer}


def upsert(c, url, key, table, rows, on_conflict):
    for i in range(0, len(rows), BATCH):
        r = c.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}", headers=_hdr(key),
                   content=json.dumps(rows[i:i + BATCH], default=str))
        if r.status_code >= 300:
            sys.exit(f"{table} upsert failed [{r.status_code}]: {r.text[:400]}")
    print(f"  {table}: {len(rows):,} upserted")


def select_all(c, url, key, table, cols):
    out, start = [], 0
    while True:
        r = c.get(f"{url}/rest/v1/{table}?select={cols}",
                  headers={**_hdr(key, "count=none"), "Range": f"{start}-{start + 999}"})
        if r.status_code >= 300:
            sys.exit(f"{table} select failed [{r.status_code}]: {r.text[:400]}")
        page = r.json()
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def main():
    url, key = _load_env()
    entries = json.load(open(os.path.join(DDIR, "clean_entries.json"), encoding="utf-8"))
    raw = json.load(open(os.path.join(DDIR, "hc_dist_raw.json"), encoding="utf-8"))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for r in entries:
        r["updated_at"] = now
    raw_rows = [dict(form_uid=FORM_UID, kobo_id=r.get("_id"), submitted_at=r.get("_submission_time"), raw=r) for r in raw]
    with httpx.Client(timeout=120) as c:
        upsert(c, url, key, "hc_dist_raw_submissions", raw_rows, "kobo_id")
        upsert(c, url, key, "hc_dist_entries", entries, "kobo_id")
        if entries:                                  # never prune on an empty fetch
            live = {e["kobo_id"] for e in entries}
            gone = sorted({r["kobo_id"] for r in select_all(c, url, key, "hc_dist_entries", "kobo_id")} - live)
            for i in range(0, len(gone), 200):
                ids = ",".join(map(str, gone[i:i + 200]))
                for t in ("hc_dist_entries", "hc_dist_raw_submissions"):
                    r = c.delete(f"{url}/rest/v1/{t}?kobo_id=in.({ids})", headers=_hdr(key, "return=minimal"))
                    if r.status_code >= 300:
                        sys.exit(f"{t} prune failed [{r.status_code}]: {r.text[:400]}")
            print(f"  pruned {len(gone)} submissions deleted in Kobo")
        r = c.post(f"{url}/rest/v1/hc_dist_sync_meta?on_conflict=id", headers=_hdr(key),
                   content=json.dumps([dict(id=1, last_synced_at=now, n_entries=len(entries),
                                            notes="pipeline/hc_seedlings load")]))
        if r.status_code >= 300:
            sys.exit(f"hc_dist_sync_meta stamp failed [{r.status_code}]: {r.text[:400]}")
    print("done; hc_dist_sync_meta stamped.")


if __name__ == "__main__":
    main()
