# ECA Trainings & Events — data pipeline & Supabase sync

Ingests the **ECA Trainings and Events Tracker** Kobo form
(`aCt5s6EGUnE7UxJVeuXjpY`), transforms it into tidy tables, and upserts into
Supabase, where the Next.js dashboard (`app/eca-events/`) reads it via PII-free
views.

```
Kobo ──(MCP interactive │ REST cron)──► raw submissions
      flatten → decode (choices.json) → explode multi-selects → dedup → derive
      → build_dataset() → sync_supabase.py → Supabase eca_* tables → v_eca_*_safe / KPI views
```

## Layout
```
config.py                     form UID, field/group config, admin levels, PII, youth age
choices.json                  authoritative code→label map (from Kobo get_form_content)
data_pipeline/                flatten · decode · transform · pipeline · ingest · synthetic
sync_supabase.py              build_dataset() → idempotent upsert into Supabase
tests/                        pipeline unit tests + real-sample structural test
requirements.txt
```

## Two ingestion paths (why both exist)
- **Interactive / MCP** — the connected Kobo MCP server (`get_submissions`) is
  driven from a Claude Code session for the initial load and ad-hoc refreshes.
  A Kobo MCP server exists **only** inside such a session, so a scheduled runner
  cannot call it. To load via MCP: page `get_submissions` into
  `data_pipeline/cache/raw_submissions.json`, then `sync_supabase.py --source cache`.
- **Headless / REST** — the scheduled GitHub Action
  (`.github/workflows/eca-events-sync.yml`) fetches via the Kobo REST API with a
  `KOBO_TOKEN` secret (same pattern as `pipeline/seedlings/`). This is the only
  option for unattended runs. `--source live` uses this path.

Both are hidden behind `data_pipeline/ingest.py`; nothing downstream cares which ran.

## Run it
```bash
cd pipeline/eca-events
pip install -r requirements.txt

# validate transforms only, no DB (offline sample):
python sync_supabase.py --source synthetic --dry-run

# full sync into Supabase (headless REST):
export KOBO_TOKEN=...                     # Kobo → Account → Security → API key
export NEXT_PUBLIC_SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...
python sync_supabase.py --source live

python -m pytest tests/ -q                # pipeline tests
```

## Schema
Defined in `supabase/migrations/0001_eca_events.sql`. Base tables (`eca_*`) hold
PII and are locked by RLS to the service role; the dashboard reads only the
granted `v_eca_*_safe` and KPI views. Idempotent: submissions upsert on
`submission_id`; child tables rebuild each run (full re-fetch is cheap at ~7k).

## Updating for a form change / new project or topic
Codes decode via `choices.json`. When Kobo adds a project/topic/module, refresh
it: call `get_form_content("aCt5s6EGUnE7UxJVeuXjpY")` (MCP) and regenerate the
map — new codes get real labels with no code change. Unknown codes fall back to
a humanised label so nothing breaks in the meantime.
