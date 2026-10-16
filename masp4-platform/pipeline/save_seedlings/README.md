# SAVE KE Seedlings Distribution dashboard

Nightly-refreshed dashboard for the Kobo form **SAVE KE Seedlings Distribution**
(UID `ar7ZyJqG8qJ9sUu4JLWiTY`, Nyandarua, Kenya). Served at
`/SAVE_KE_Seedlings_Dashboard.html` and linked from **Output Insights**.

Supabase is the source of truth — the dashboard is built from the database, not from Kobo directly.

```
Kobo API ─fetch_save_seedlings.py─▶ save_dist_*.csv + save_dist_raw.json (PII stripped, gitignored)
Google Sheet ─fetch_profiled.py──▶ clean_profiled.json (register; names/phones/GPS dropped)
Google Sheet ─fetch_framework.py─▶ clean_framework.json (logframe KPIs, tab dashboard_input)
         ─transform.py───────────▶ clean_events.json + clean_entries.json (rounds, dup flags)
         ─load_supabase.py───────▶ Supabase save_dist_* tables (Sprint 24; upsert + prune)
Supabase ─build_dashboard.py─────▶ public/SAVE_KE_Seedlings_Dashboard.html → Vercel
GitHub Actions: .github/workflows/save_seedlings.yml (03:20 UTC daily, on push, manual)
Secrets: KOBO_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same as vsla/cva)
```

## Supabase (Sprint 24 — `pipeline/masp4_migration_sprint24_save_seedlings_distribution.sql`)
| Object | Grain |
|---|---|
| `save_dist_raw_submissions` | Kobo JSON per submission, farmer names/phones stripped |
| `save_dist_events` | one row per distribution event (submission) |
| `save_dist_farmer_entries` | one row per farmer entry, with `is_probable_dup`, `is_first_receipt` |
| `save_dist_profiled_farmers` | profiled-farmer register (Sprint 26), one row per beneficiary ID |
| `v_save_dist_profiled_coverage` | profiled vs reached by ward, incl. women / youth |
| `save_mf_indicator_values` | logframe KPI values, one row per indicator × 6-monthly period (Sprint 27) |
| `v_save_mf_progress` | latest progress per indicator vs end target |
| `save_dist_sync_meta` | last sync time + row counts |
| `v_save_dist_ward_summary`, `v_save_dist_round_summary`, `v_save_dist_species_totals` | rollups (`security_invoker`) |

RLS: SELECT for **authenticated** users only (like `cfp_*`); the ETL writes with the service role.

## Run locally
```bash
pip install -r pipeline/save_seedlings/requirements.txt
KOBO_TOKEN=<token> python pipeline/save_seedlings/fetch_save_seedlings.py
python pipeline/save_seedlings/transform.py
python pipeline/save_seedlings/load_supabase.py     # Supabase creds from .env.local or env
python pipeline/save_seedlings/build_dashboard.py
```
`SAVE_DATA_DIR` overrides where working files are written and read; `SAVE_OUT` overrides the HTML path.

## Profiled-farmer register (Executive → "Profiled farmers vs reached")
Source: Google Sheet *SAVE KE Profiled Farmers Summary 20241015* (`1nWQwYcmygu2aeEJLIUq-bVirMLtF-OVZgrTRoEAl19E`, tab `in`).
`fetch_profiled.py` reads it with the `GOOGLE_CREDENTIALS` service account — **share the sheet (Viewer) with that
account's `client_email`**. Without access the nightly run keeps the register already in Supabase.
Reach is matched on `sol_beneficiary_id`; with a round selected, coverage is cumulative to the end of that round.
Sub-county is taken from the ward (the register has alternative names, e.g. Charagita under "Nyandarua West").
Initial load (2026-10-16) was made from the sheet via `fetch_profiled.py --csv`.

## Measurement framework (tab "8 · Measurement Framework")
Source: Google Sheet *SAVE Project M&E Framework* (`1tAW3zllJ1UYYIbMl5XTqVQhN8MBXrcFRKMm3erD1aN4`), tab
**`dashboard_input`** (gid 2028076445) — a tidy copy of the `logframe` tab created 2026-10-16: one row per
indicator × period, numeric `total / male / female / youth / survival_rate_%`, plus `cumulative (Y/N)`.
The M&E team edits that tab (embedded, editable, in dashboard tab 8 — Google access required); the
`logframe` tab is untouched and kept for reference. Progress = latest value when cumulative = Y or blank,
sum of periods when N; values typed into a period that has not ended are shown as provisional.
Trees planted is cross-checked against seedlings distributed on the Kobo form.

## Data model
- One submission = one **distribution event**; the `farmer_details` repeat = one **farmer entry**.
- Farmers are identified by `farmer__sol_beneficiary_id` (falls back to `farmer_ref_no`).
- **Rounds** are detected from the data: a gap of more than 21 days between events opens a new round.
- **Probable duplicate** = same farmer recorded again within 7 days. Headline totals include them;
  the Executive view has an "Exclude probable duplicates" toggle and the Data Quality tab quantifies them.
- Test submissions (`real_test_submission = test`) are dropped.

## PII
Farmer names and phone numbers are never written to disk or Supabase. Beneficiary IDs become integer indices
before embedding; enumerators appear as codes (E01…); comments are reduced to keyword counts.
