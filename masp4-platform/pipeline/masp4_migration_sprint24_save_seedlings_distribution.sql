-- =============================================================
-- MASP IV Sprint 24 Migration — SAVE KE Seedlings Distribution
-- Source: Kobo "SAVE KE Seedlings Distribution" (asset ar7ZyJqG8qJ9sUu4JLWiTY)
-- Additive only. Namespaced save_dist_* ; does not touch any existing table.
--
-- Grain:
--   save_dist_raw_submissions = Kobo JSON per submission, farmer names/phones STRIPPED
--   save_dist_events          = one row per submission (a distribution event)
--   save_dist_farmer_entries  = one row per farmer in the farmer_details repeat
--   save_dist_sync_meta       = last-sync tracker (mirrors vsla_/cfp_sync_meta)
--
-- Derived fields (round_no, is_probable_dup, is_first_receipt, gps_in_area) are
-- computed by pipeline/save_seedlings/transform.py and recomputed every night.
--
-- RLS follows cfp_ (Sprint 23), NOT the anon-readable cva_/vsla_ convention:
-- farmer-level rows are readable only by authenticated users; the ETL writes with
-- the service role, which bypasses RLS. No client write policies.
--
-- Idempotent: safe to re-run. Run in Supabase SQL Editor or via MCP.
-- =============================================================

-- ── 1. RAW landing (audit + reprocess; PII stripped before insert) ──
CREATE TABLE IF NOT EXISTS save_dist_raw_submissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  form_uid      text        NOT NULL,
  kobo_id       bigint      NOT NULL UNIQUE,
  submitted_at  timestamptz,
  raw           jsonb       NOT NULL,
  fetched_at    timestamptz DEFAULT now()
);

-- ── 2. EVENTS (one row per submission) ───────────────────────
CREATE TABLE IF NOT EXISTS save_dist_events (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kobo_id       bigint      NOT NULL UNIQUE,
  uuid          text,
  form_version  text,
  submitted_at  timestamptz,
  started_at    timestamptz,
  ended_at      timestamptz,
  is_test       boolean     NOT NULL DEFAULT false,
  sub_county    text,
  ward          text,
  village       text,                         -- free text, title-cased
  lat           numeric,
  lon           numeric,
  gps_in_area   boolean,                      -- inside the Nyandarua bounding box
  enumerator    text,                         -- staff name; dashboard shows codes only
  comments      text,
  n_farmers     int,
  round_no      int,                          -- derived: >21-day gap opens a new round
  round_label   text,
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS save_dist_ev_ward_idx  ON save_dist_events (ward);
CREATE INDEX IF NOT EXISTS save_dist_ev_round_idx ON save_dist_events (round_no);

-- ── 3. FARMER ENTRIES (one row per farmer_details repeat) ────
CREATE TABLE IF NOT EXISTS save_dist_farmer_entries (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_kobo_id     bigint  NOT NULL,
  entry_no          int     NOT NULL,
  beneficiary_id    text,                     -- Solidaridad beneficiary ID (falls back to ref no)
  farmer_ref_no     text,
  reg_sub_county    text,                     -- from the approved farmer register
  reg_ward          text,
  reg_village       text,
  cooperative       text,
  already_received  text,                     -- 'yes' / 'no' / '' (form check; blank on early versions)
  total_seedlings   int,
  cordia            int, bamboo int, grevillea int, dombeya int, sesbania int,
  calliandra        int, azadirachta int, avocado int, apple int,
  species_sum_ok    boolean,                  -- species counts add up to total
  distributed_at    timestamptz,
  is_probable_dup   boolean,                  -- same farmer again within 7 days
  is_first_receipt  boolean,                  -- first time this farmer received seedlings
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (event_kobo_id, entry_no)
);
CREATE INDEX IF NOT EXISTS save_dist_fe_event_idx ON save_dist_farmer_entries (event_kobo_id);
CREATE INDEX IF NOT EXISTS save_dist_fe_benef_idx ON save_dist_farmer_entries (beneficiary_id);

-- ── 4. Sync tracker ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS save_dist_sync_meta (
  id              int PRIMARY KEY,
  last_synced_at  timestamptz,
  n_events        int,
  n_entries       int,
  notes           text
);
INSERT INTO save_dist_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 5. RLS: authenticated read only; service role writes ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['save_dist_raw_submissions','save_dist_events',
                           'save_dist_farmer_entries','save_dist_sync_meta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_sel', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t||'_sel', t);
  END LOOP;
END $$;

-- ── 6. Analytics views (security_invoker → caller's RLS applies) ──
CREATE OR REPLACE VIEW v_save_dist_ward_summary WITH (security_invoker = true) AS
SELECT e.sub_county, e.ward,
       count(*)                                    AS farmer_entries,
       count(DISTINCT f.beneficiary_id)            AS unique_farmers,
       sum(f.total_seedlings)                      AS seedlings,
       count(*) FILTER (WHERE f.is_probable_dup)   AS probable_dups
FROM save_dist_farmer_entries f
JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
WHERE NOT e.is_test AND coalesce(f.total_seedlings, 0) > 0
GROUP BY e.sub_county, e.ward;

CREATE OR REPLACE VIEW v_save_dist_round_summary WITH (security_invoker = true) AS
SELECT e.round_no, e.round_label,
       min(e.started_at)::date                     AS first_event,
       max(e.started_at)::date                     AS last_event,
       count(DISTINCT e.kobo_id)                   AS events,
       count(*)                                    AS farmer_entries,
       count(DISTINCT f.beneficiary_id)            AS unique_farmers,
       count(*) FILTER (WHERE f.is_first_receipt)  AS first_time_farmers,
       sum(f.total_seedlings)                      AS seedlings
FROM save_dist_farmer_entries f
JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
WHERE NOT e.is_test AND coalesce(f.total_seedlings, 0) > 0
GROUP BY e.round_no, e.round_label;

CREATE OR REPLACE VIEW v_save_dist_species_totals WITH (security_invoker = true) AS
SELECT sum(f.calliandra) AS calliandra, sum(f.sesbania) AS sesbania, sum(f.dombeya) AS dombeya,
       sum(f.grevillea) AS grevillea, sum(f.avocado) AS avocado, sum(f.cordia) AS cordia,
       sum(f.azadirachta) AS azadirachta, sum(f.apple) AS apple, sum(f.bamboo) AS bamboo,
       sum(f.total_seedlings) AS total
FROM save_dist_farmer_entries f
JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
WHERE NOT e.is_test;

-- ── 7. Verify ────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'save_dist_%' ORDER BY table_name;
