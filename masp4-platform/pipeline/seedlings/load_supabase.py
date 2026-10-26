"""
Load clean UG seedlings data (application + distribution) into Supabase (PostgREST
upsert). Idempotent — safe to re-run nightly: upserts on natural keys, then prunes
rows whose Kobo submission (or repeat entry) no longer exists, so the tables mirror
the forms.

Reads transform outputs (clean_*.json), upserts into the ug_seed_* tables
(Sprint 47), then stamps ug_seed_sync_meta.

Env (from masp4-platform/.env.local or the CI environment):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, json, sys, datetime, time
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SEEDLINGS_DATA_DIR", HERE)
BATCH = 500

# table -> (clean file, natural key columns)
TABLES = [
    ("ug_seed_applications", "applications", ["kobo_id"]),
    ("ug_seed_application_items", "items", ["application_kobo_id", "item_no"]),
    ("ug_seed_dist_events", "dist_events", ["kobo_id"]),
    ("ug_seed_dist_entries", "dist_entries", ["event_kobo_id", "entry_no"]),
]


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
    return {"apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json", "Prefer": prefer}


def upsert(c, url, key, table, rows, on_conflict):
    n = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        r = c.post(f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                   headers=_hdr(key), content=json.dumps(chunk, default=str))
        if r.status_code >= 300:
            sys.exit(f"{table} upsert failed [{r.status_code}]: {r.text[:400]}")
        n += len(chunk)
    print(f"  {table}: {n:,} upserted")


def select_all(c, url, key, table, cols):
    out, start = [], 0
    while True:
        for attempt in range(4):        # retry dropped connections (WinError 10054 / resets)
            try:
                r = c.get(f"{url}/rest/v1/{table}?select={cols}&order=id",
                          headers={**_hdr(key, "count=none"), "Range": f"{start}-{start + 999}"})
                break
            except httpx.TransportError:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)
        if r.status_code >= 300:
            sys.exit(f"{table} select failed [{r.status_code}]: {r.text[:400]}")
        page = r.json()
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def delete_where(c, url, key, table, filt):
    r = c.delete(f"{url}/rest/v1/{table}?{filt}", headers=_hdr(key, "return=minimal"))
    if r.status_code >= 300:
        sys.exit(f"{table} delete failed [{r.status_code}]: {r.text[:400]}")


def prune(c, url, key, table, cols, live):
    """Delete rows whose natural key is no longer in the fresh load."""
    gone = [r for r in select_all(c, url, key, table, ",".join(cols))
            if tuple(r[k] for k in cols) not in live]
    if len(cols) == 1:
        ids = [r[cols[0]] for r in gone]
        for i in range(0, len(ids), 200):
            delete_where(c, url, key, table, f"{cols[0]}=in.({','.join(map(str, ids[i:i + 200]))})")
    else:
        for r in gone:
            delete_where(c, url, key, table, "&".join(f"{k}=eq.{r[k]}" for k in cols))
    print(f"  {table}: {len(gone):,} pruned")


def main():
    url, key = _load_env()
    data = {name: json.load(open(os.path.join(DDIR, f"clean_{name}.json"), encoding="utf-8"))
            for _, name, _ in TABLES}
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with httpx.Client(timeout=180) as c:
        for table, name, cols in TABLES:
            rows = data[name]
            for r in rows:
                r["updated_at"] = now
            upsert(c, url, key, table, rows, ",".join(cols))
            # Guard: never prune on an empty fetch
            if rows:
                prune(c, url, key, table, cols, {tuple(r[k] for k in cols) for r in rows})

        meta = dict(id=1, last_synced_at=now, n_applications=len(data["applications"]),
                    n_items=len(data["items"]), n_dist_events=len(data["dist_events"]),
                    n_dist_entries=len(data["dist_entries"]), notes="pipeline/seedlings load")
        r = c.post(f"{url}/rest/v1/ug_seed_sync_meta?on_conflict=id", headers=_hdr(key),
                   content=json.dumps([meta]))
        if r.status_code >= 300:
            sys.exit(f"ug_seed_sync_meta stamp failed [{r.status_code}]: {r.text[:400]}")
    print("done; ug_seed_sync_meta stamped.")


if __name__ == "__main__":
    main()
