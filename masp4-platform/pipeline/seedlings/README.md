# Seedlings dashboard pipeline

Builds the UG Tree Seedlings dashboard (Kobo form `a5rJdqQGuy2DtTXvEx3cpq`) from
`.github/workflows/seedlings.yml`, nightly at 03:00 UTC.

## Two artifacts, deliberately

| Artifact | Where it goes | Changes |
|---|---|---|
| `Seedlings_Dashboard.html` (~22 KB shell) | committed to `public/` | only when the template changes |
| `seedlings_payload.json` (~5 MB data) | Supabase Storage, gitignored | every run |

The payload used to be inlined into the HTML. It is ~99.9% of the rendered file,
so that meant committing 5 MB nightly and shipping every data refresh through a
redeploy. When the repo that builds the dashboard isn't the repo that deploys it,
refreshes silently stop reaching production — which is exactly what happened
between 2026-07-24 and 2026-08-12 (production sat 19 days stale at 53,824
applications while the build repo had 54,390).

Keeping data out of the artifact decouples refresh from deploy. It's the same
property that kept `/eca-events` current through the same outage.

## Steps

```
fetch_seedlings_json.py   Kobo  -> seedlings_main.csv + seedlings_items.csv   (gitignored)
build_dashboard.py        CSVs  -> public/Seedlings_Dashboard.html + seedlings_payload.json
upload_payload.py         JSON  -> Supabase Storage (overwrite + read-back verify)
```

The upload runs *before* the commit, so a failed publish leaves the previous good
payload paired with the deployed shell rather than half-applying a refresh.

## Config

Workflow secrets — the job skips with a `::notice::` if any are missing:

- `KOBO_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Storage: public bucket `dashboard-data`, object `seedlings/payload.json`, served at

```
{SUPABASE_URL}/storage/v1/object/public/dashboard-data/seedlings/payload.json
```

Public-read is intentional and matches the dashboard's own exposure. The payload
is aggregate-only — region, district, project, month, seedlings, cost — with no
farmer names, phone numbers, national IDs or beneficiary codes.

## Environment overrides

| Var | Default | Purpose |
|---|---|---|
| `SEEDLINGS_DATA_URL` | *(required)* | URL the shell fetches; build fails without it |
| `SEEDLINGS_INLINE` | unset | `1` embeds the payload — the old self-contained file |
| `SEEDLINGS_DATA_DIR` | script dir | where CSVs and the payload live |
| `SEEDLINGS_OUT` | `public/Seedlings_Dashboard.html` | shell output path |
| `SEEDLINGS_PAYLOAD_OUT` | `<data dir>/seedlings_payload.json` | payload output path |
| `SEEDLINGS_BUCKET` / `SEEDLINGS_OBJECT` | `dashboard-data` / `seedlings/payload.json` | upload target |

Build a self-contained copy for offline review:

```bash
SEEDLINGS_INLINE=1 python build_dashboard.py
```
