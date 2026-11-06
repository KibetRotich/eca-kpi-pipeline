-- =============================================================
-- MASP IV Sprint 68 — Harvesting Carbon (Uganda) Agroforestry Seedling Distribution
-- Source: Kobo "Harvesting Carbon Project - Agroforestry Seedling Distribution"
--         (asset afH6NHNNZmVHQfCnuxGx3p). One submission = one farmer receiving seedlings.
-- Feeds public/HC_Seedlings_UG_Dashboard.html (Granular Data tile "Seedlings Distribution –
-- Uganda (Harvesting Carbon)"), built nightly by pipeline/hc_seedlings (user, 2026-11-06).
--
-- Grain:
--   hc_dist_raw_submissions = Kobo JSON per submission, farmer name + phone STRIPPED
--   hc_dist_entries         = one row per submission (a farmer receiving seedlings)
--   hc_dist_sync_meta       = last-sync tracker
-- Derived fields (month_label, is_first_receipt, is_probable_dup, quality flags) are computed by
-- pipeline/hc_seedlings/transform.py and recomputed every night.
--
-- Access: service role only (current platform rule, Sprints 50/59). RLS on with NO policies, and
-- every privilege revoked from anon and authenticated — the pipeline and the dashboard build use the
-- service role. Farmer codes and staff names stay here; the dashboard embeds counts and codes only.
--
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS hc_dist_raw_submissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  form_uid      text        NOT NULL,
  kobo_id       bigint      NOT NULL UNIQUE,
  submitted_at  timestamptz,
  raw           jsonb       NOT NULL,
  fetched_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hc_dist_entries (
  id                     uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kobo_id                bigint      NOT NULL UNIQUE,
  uuid                   text,
  form_version           text,
  submitted_at           timestamptz,
  started_at             timestamptz,
  ended_at               timestamptz,
  distributed_on         date,                    -- "Date of distribution"
  distribution_month     text,                    -- month picked in the form (january … december)
  month_label            text,                    -- derived from distributed_on, e.g. 'Mar 2026'
  month_matches_date     boolean,                 -- picked month = month of distributed_on
  region                 text,
  district               text,
  sub_county             text,                    -- free text, trimmed + title-cased
  village                text,                    -- free text, trimmed + title-cased
  farmer_code            text,                    -- Solidaridad farmer code, upper-cased (staff-only)
  code_valid             boolean,                 -- matches the AA-99-99 pattern
  sex                    text,
  age_group              text,                    -- youth / adult / elderly
  species_selected       text,                    -- space-separated choices ticked
  albizia                int,
  ficus_mucuso           int,
  ficus_natalensis       int,
  calliandra             int,
  total_seedlings        int,                     -- species counts summed (the form's own calculation)
  selection_matches      boolean,                 -- a count is given for every ticked species and only those
  staff                  text,                    -- staff in charge (dashboard shows codes only)
  enumerator             text,                    -- enumerator (dashboard shows codes only)
  is_first_receipt       boolean,                 -- first time this farmer code received seedlings
  is_probable_dup        boolean,                 -- same farmer code again within 7 days
  updated_at             timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hc_dist_entries_code_idx  ON hc_dist_entries (farmer_code);
CREATE INDEX IF NOT EXISTS hc_dist_entries_month_idx ON hc_dist_entries (month_label);

CREATE TABLE IF NOT EXISTS hc_dist_sync_meta (
  id              int PRIMARY KEY,
  last_synced_at  timestamptz,
  n_entries       int,
  notes           text
);
INSERT INTO hc_dist_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hc_dist_raw_submissions','hc_dist_entries','hc_dist_sync_meta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE %I TO service_role', t);
  END LOOP;
END $$;
