-- =============================================================
-- MASP IV Sprint 47 Migration — UG Tree Seedlings: Application + Distribution
-- Sources: Kobo "ECA Agribusiness UG Seedlings Application"  (asset a5rJdqQGuy2DtTXvEx3cpq)
--          Kobo "ECA Agribusiness UG Seedlings Distribution" (asset aGXzNqEgZhjXazLmLPVpMn)
-- Additive only. Namespaced ug_seed_* ; does not touch any existing table.
--
-- Grain:
--   ug_seed_applications      = one row per application submission (farmer request)
--   ug_seed_application_items = one row per species line in the request_items repeat
--   ug_seed_dist_events       = one row per distribution submission (a distribution event)
--   ug_seed_dist_entries      = one row per farmer in the distribution farmer_details repeat
--   ug_seed_sync_meta         = last-sync tracker
--
-- Join: dist entry sub_id__farmer_id = '<application _id>__<farmer_ref_no>', so
-- application_kobo_id is the part before the first '__'. Derived fields
-- (is_distributed, days_to_distribution, is_repeat, is_legacy …) are computed by
-- pipeline/seedlings/transform.py and recomputed every night.
--
-- No raw-JSON landing table (unlike save_dist_): the application raw JSON is ~300 MB.
-- PII (farmer names, national IDs, phones, addresses, witness details) is never
-- loaded — only presence flags and pseudonymous Solidaridad IDs.
--
-- RLS follows cfp_ / save_dist_: authenticated read only; the ETL writes with the
-- service role, which bypasses RLS. No client write policies.
--
-- Idempotent: safe to re-run. Run in Supabase SQL Editor or via MCP.
-- =============================================================

-- ── 1. APPLICATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ug_seed_applications (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kobo_id               bigint      NOT NULL UNIQUE,
  uuid                  text,
  form_version          text,
  submitted_at          timestamptz,
  started_at            timestamptz,
  ended_at              timestamptz,
  region                text,
  district              text,
  cooperative           text,
  other_cooperative     text,
  project               text,
  lat                   numeric,
  lon                   numeric,
  beneficiary_id        text,                 -- Solidaridad beneficiary ID (pseudonymous)
  farmer_id             text,                 -- scanned Farmer ID card
  manual_farmer_id      text,                 -- typed fallback
  have_farmer_id        text,
  no_farmer_id_reason   text,
  already_applied       text,
  has_national_id       boolean,              -- presence flag only; the ID itself is not stored
  has_witness           boolean,              -- presence flag only
  witness_date          date,
  n_form_photos         int,
  total_seedlings       numeric,
  total_seedlings_cost  numeric,
  facilitation_cost     numeric,
  transport_cost        numeric,
  grand_total           numeric,
  enumerator            text,                 -- select-list code
  enumerator_name       text,                 -- resolved full name
  comments              text,
  suggested_seedlings   text,
  -- derived from the distribution form (transform.py)
  is_distributed        boolean     NOT NULL DEFAULT false,
  first_distributed_at  timestamptz,
  seedlings_given       int,
  days_to_distribution  int,
  n_dist_entries        int         NOT NULL DEFAULT 0,
  updated_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ug_seed_app_district_idx ON ug_seed_applications (district);
CREATE INDEX IF NOT EXISTS ug_seed_app_benef_idx    ON ug_seed_applications (beneficiary_id);

-- ── 2. APPLICATION LINE ITEMS ────────────────────────────────
CREATE TABLE IF NOT EXISTS ug_seed_application_items (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  application_kobo_id bigint  NOT NULL,
  item_no             int     NOT NULL,
  species             text,                   -- advance_item, raw code
  quantity_raw        text,                   -- the form stores quantity as text
  quantity            numeric,
  other_species_name  text,
  line_cost           numeric,
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (application_kobo_id, item_no)
);
CREATE INDEX IF NOT EXISTS ug_seed_item_app_idx ON ug_seed_application_items (application_kobo_id);

-- ── 3. DISTRIBUTION EVENTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ug_seed_dist_events (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kobo_id           bigint      NOT NULL UNIQUE,
  uuid              text,
  form_version      text,
  submitted_at      timestamptz,
  started_at        timestamptz,
  is_test           boolean     NOT NULL DEFAULT false,
  country           text,
  region            text,
  district          text,
  distribution_name text,
  lat               numeric,
  lon               numeric,
  enumerator        text,
  comments          text,
  n_farmers         int,
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ug_seed_ev_district_idx ON ug_seed_dist_events (district);

-- ── 4. DISTRIBUTION FARMER ENTRIES ───────────────────────────
CREATE TABLE IF NOT EXISTS ug_seed_dist_entries (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_kobo_id       bigint      NOT NULL,
  entry_no            int         NOT NULL,
  application_kobo_id bigint,                 -- parsed from sub_id__farmer_id
  farmer_ref_no       text,
  beneficiary_id      text,
  reg_district        text,                   -- from the approved-applications lookup
  reg_sub_county      text,
  cooperative         text,
  applied_total       int,
  applied_cost        numeric,
  already_given       text,                   -- 'yes' / 'no' / '' (lookup flag)
  seedlings_given     int,
  distributed_at      timestamptz,
  matched             boolean,                -- application_kobo_id exists in ug_seed_applications
  is_legacy           boolean,                -- 2023–24 trial records: no seedlings, no lookup
  is_repeat           boolean,                -- not the first delivery recorded for this application
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (event_kobo_id, entry_no)
);
CREATE INDEX IF NOT EXISTS ug_seed_en_event_idx ON ug_seed_dist_entries (event_kobo_id);
CREATE INDEX IF NOT EXISTS ug_seed_en_app_idx   ON ug_seed_dist_entries (application_kobo_id);

-- ── 5. Sync tracker ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ug_seed_sync_meta (
  id              int PRIMARY KEY,
  last_synced_at  timestamptz,
  n_applications  int,
  n_items         int,
  n_dist_events   int,
  n_dist_entries  int,
  notes           text
);
INSERT INTO ug_seed_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 6. RLS: authenticated read only; service role writes ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ug_seed_applications','ug_seed_application_items',
                           'ug_seed_dist_events','ug_seed_dist_entries','ug_seed_sync_meta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_sel', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t||'_sel', t);
  END LOOP;
END $$;

-- ── 7. Analytics views (security_invoker → caller's RLS applies) ──
-- Fulfilment is measured on applications from 2025 onwards: there were no
-- distributions for the 2023–24 application rounds.
CREATE OR REPLACE VIEW v_ug_seed_fulfilment_district WITH (security_invoker = true) AS
SELECT region, district,
       count(*)                                       AS applications,
       count(*) FILTER (WHERE is_distributed)         AS served,
       round(100.0 * count(*) FILTER (WHERE is_distributed) / nullif(count(*), 0), 1) AS fulfilment_pct,
       sum(total_seedlings)                           AS seedlings_applied,
       sum(seedlings_given)                           AS seedlings_given,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_distribution) AS median_days
FROM ug_seed_applications
WHERE submitted_at >= '2025-01-01'
GROUP BY region, district;

CREATE OR REPLACE VIEW v_ug_seed_fulfilment_monthly WITH (security_invoker = true) AS
SELECT to_char(date_trunc('month', submitted_at), 'YYYY-MM') AS cohort_month,
       count(*)                                       AS applications,
       count(*) FILTER (WHERE is_distributed)         AS served,
       sum(seedlings_given)                           AS seedlings_given
FROM ug_seed_applications
GROUP BY 1;

-- ── 8. Verify ────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'ug_seed_%' ORDER BY table_name;
