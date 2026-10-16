"""
Load clean SAVE KE distribution data into Supabase (PostgREST upsert). Idempotent —
safe to re-run nightly: upserts on natural keys, then prunes rows whose Kobo
submission (or repeat entry) no longer exists, so the tables mirror the form.

Reads transform outputs (clean_*.json) plus the PII-stripped raw JSON, upserts into
the save_dist_* tables (Sprint 24), then stamps save_dist_sync_meta.

Env (from masp4-platform/.env.local or the CI environment):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import os, json, sys, datetime
import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("SAVE_DATA_DIR", HERE)
FORM_UID = "ar7ZyJqG8qJ9sUu4JLWiTY"
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
        r = c.get(f"{url}/rest/v1/{table}?select={cols}",
                  headers={**_hdr(key, "count=none"), "Range": f"{start}-{start + 999}"})
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


def load(name):
    return json.load(open(os.path.join(DDIR, f"clean_{name}.json"), encoding="utf-8"))


def main():
    url, key = _load_env()
    events, entries = load("events"), load("entries")
    raw = json.load(open(os.path.join(DDIR, "save_dist_raw.json"), encoding="utf-8"))
    raw_rows = [dict(form_uid=FORM_UID, kobo_id=r.get("_id"), submitted_at=r.get("_submission_time"), raw=r)
                for r in raw]
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for r in events + entries:
        r["updated_at"] = now

    print(f"Upserting: raw={len(raw_rows):,}, events={len(events):,}, entries={len(entries):,}")
    with httpx.Client(timeout=120) as c:
        upsert(c, url, key, "save_dist_raw_submissions", raw_rows, "kobo_id")
        upsert(c, url, key, "save_dist_events", events, "kobo_id")
        upsert(c, url, key, "save_dist_farmer_entries", entries, "event_kobo_id,entry_no")

        # Prune rows deleted/edited away in Kobo. Guard: never prune on an empty fetch.
        if events:
            live_ev = {e["kobo_id"] for e in events}
            live_en = {(e["event_kobo_id"], e["entry_no"]) for e in entries}
            gone_ev = sorted({r["kobo_id"] for r in select_all(c, url, key, "save_dist_events", "kobo_id")} - live_ev)
            for i in range(0, len(gone_ev), 200):
                ids = ",".join(map(str, gone_ev[i:i + 200]))
                for t, col in (("save_dist_farmer_entries", "event_kobo_id"), ("save_dist_events", "kobo_id"),
                               ("save_dist_raw_submissions", "kobo_id")):
                    delete_where(c, url, key, t, f"{col}=in.({ids})")
            stale = [r for r in select_all(c, url, key, "save_dist_farmer_entries", "event_kobo_id,entry_no")
                     if (r["event_kobo_id"], r["entry_no"]) not in live_en]
            for r in stale:
                delete_where(c, url, key, "save_dist_farmer_entries",
                             f"event_kobo_id=eq.{r['event_kobo_id']}&entry_no=eq.{r['entry_no']}")
            print(f"  pruned: {len(gone_ev)} deleted submissions, {len(stale)} stale farmer entries")

        meta = dict(id=1, last_synced_at=now, n_events=len(events), n_entries=len(entries),
                    notes="pipeline/save_seedlings load")
        r = c.post(f"{url}/rest/v1/save_dist_sync_meta?on_conflict=id", headers=_hdr(key),
                   content=json.dumps([meta]))
        if r.status_code >= 300:
            sys.exit(f"save_dist_sync_meta stamp failed [{r.status_code}]: {r.text[:400]}")
    print("done; save_dist_sync_meta stamped.")


if __name__ == "__main__":
    main()
