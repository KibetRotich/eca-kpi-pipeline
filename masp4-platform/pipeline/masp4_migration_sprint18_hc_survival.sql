-- =============================================================
-- MASP IV Sprint 18 Migration — HC/SAVE Tree-Survival monitoring
-- Additive only. Namespaced hcs_* ; does not touch existing tables.
-- Grain decision (Phase 1): TWO separate cohorts, kept separate.
--   hcs_submissions  = batch/visit grain (BOTH cohorts)
--   hcs_species      = per-species grain (Form 2 / Kenya only)
--   hcs_raw_submissions = raw Kobo JSON (audit / reprocess)
--   hcs_sync_meta    = last-sync tracker (mirrors eca_sync_meta)
-- Idempotent: safe to re-run. Run in Supabase SQL Editor or via MCP.
-- =============================================================

-- ── 1. RAW landing (audit + reprocess) ───────────────────────
CREATE TABLE IF NOT EXISTS hcs_raw_submissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort        text        NOT NULL CHECK (cohort IN ('UG_HC','KE_SAVE')),
  form_uid      text        NOT NULL,
  kobo_id       bigint      NOT NULL,
  submitted_at  timestamptz,
  raw           jsonb       NOT NULL,
  fetched_at    timestamptz DEFAULT now(),
  UNIQUE (cohort, kobo_id)
);

-- ── 2. CLEAN batch grain (both cohorts) ──────────────────────
CREATE TABLE IF NOT EXISTS hcs_submissions (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort         text        NOT NULL CHECK (cohort IN ('UG_HC','KE_SAVE')),
  kobo_id        bigint      NOT NULL,
  uuid           text,
  submitted_at   timestamptz,
  country        text,
  district       text,                       -- UG (form choice list)
  admin2         text,                       -- KE (registry)
  admin3         text,                       -- KE (registry)
  village        text,
  cooperative    text,                       -- KE (dirty; cleaned defensively)
  farmer_ref     text,
  farmer_id      text,                        -- farmer_code (UG) / sol_beneficiary_id (KE)
  farmer_gender  text,                        -- UG only (KE registry has none)
  farmer_total_seedlings numeric,
  farmer_lookup_ok boolean,                   -- DEFENSIVE: registry lookup resolved
  species_taken  text,
  transport_raw  text,
  transport_clean text,                       -- DEFENSIVE: recoded to controlled list
  growth_perception text,
  had_challenges text,
  challenges     text,
  training_received text,
  collected      numeric,
  planted        numeric,
  not_planted    numeric,
  alive          numeric,
  dead           numeric,
  missing        numeric,
  surv_planted   numeric,                     -- alive/planted, clipped [0,1]
  surv_collected numeric,
  n_species      int,                         -- KE: distinct species in the repeat
  lat            numeric,
  lon            numeric,
  geo_in_bounds  boolean,                     -- DEFENSIVE: within country box
  monitoring_wave text,                       -- KE waves W1..W4
  enumerator     text,
  -- Form 2 (KE) enrichment blocks
  crops_grown    text,
  crop_failure   text,
  forest_cover_increase text,
  soil_quality_improvement text,
  biodiversity_evidence text,
  deforestation_reduction text,
  economic_benefits_products text,
  livelihood_benefit text,
  -- Form 1 (UG) coffee sub-section
  coffee_received numeric,
  coffee_planted  numeric,
  coffee_alive    numeric,
  dq_flags       text,                        -- DEFENSIVE: comma list of row issues
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (cohort, kobo_id)
);
CREATE INDEX IF NOT EXISTS hcs_submissions_cohort_idx ON hcs_submissions (cohort);
CREATE INDEX IF NOT EXISTS hcs_submissions_wave_idx   ON hcs_submissions (monitoring_wave);

-- ── 3. CLEAN species grain (Form 2 / Kenya) ──────────────────
CREATE TABLE IF NOT EXISTS hcs_species (
  id                 uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort             text    NOT NULL DEFAULT 'KE_SAVE',
  submission_kobo_id bigint  NOT NULL,
  species_idx        int     NOT NULL,
  species            text,
  collected          numeric,
  planted            numeric,
  not_planted        numeric,
  alive              numeric,
  dead               numeric,
  missing            numeric,
  surv_planted       numeric,
  tree_height        text,
  tree_health        text,
  reason_death       text,
  reason_death_bucket text,                    -- DEFENSIVE: bucketed free text
  admin3             text,                     -- denormalized for direct querying
  cooperative        text,
  monitoring_wave    text,
  submitted_at       timestamptz,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (submission_kobo_id, species_idx)
);
CREATE INDEX IF NOT EXISTS hcs_species_species_idx ON hcs_species (species);
CREATE INDEX IF NOT EXISTS hcs_species_sub_idx     ON hcs_species (submission_kobo_id);

-- ── 4. Sync tracker ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hcs_sync_meta (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at   timestamptz,
  form1_submissions int,
  form2_submissions int,
  form2_species    int,
  notes            text
);
INSERT INTO hcs_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 5. RLS (mirror platform convention: read-all, authed writes) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hcs_raw_submissions','hcs_submissions','hcs_species','hcs_sync_meta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_del', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_sel', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)', t||'_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() IS NOT NULL)', t||'_upd', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() IS NOT NULL)', t||'_del', t);
  END LOOP;
END $$;

-- ── 6. KPI views (per-cohort; NEVER pooled across cohorts) ────
CREATE OR REPLACE VIEW v_hcs_cohort_kpi AS
SELECT
  cohort,
  count(*)                                              AS n_submissions,
  count(DISTINCT farmer_id)                             AS n_farmers,
  round(sum(alive)::numeric / NULLIF(sum(planted),0),4) AS survival_rate,        -- KPI1
  round(sum(planted)::numeric / NULLIF(sum(collected),0),4) AS establishment_rate, -- KPI2
  round(avg((geo_in_bounds)::int)::numeric,4)           AS pct_gps_ok,
  round(avg((farmer_lookup_ok)::int)::numeric,4)        AS pct_lookup_ok,
  sum(planted)                                          AS total_planted,
  sum(alive)                                            AS total_alive
FROM hcs_submissions
GROUP BY cohort;

CREATE OR REPLACE VIEW v_hcs_species_kpi AS       -- KPI3 (Kenya)
SELECT
  species,
  count(*)                                              AS n_rows,
  round(sum(alive)::numeric / NULLIF(sum(planted),0),4) AS survival_rate,
  sum(planted)                                          AS total_planted,
  sum(alive)                                            AS total_alive
FROM hcs_species
WHERE species IS NOT NULL
GROUP BY species
ORDER BY survival_rate;

CREATE OR REPLACE VIEW v_hcs_location_kpi AS      -- KPI4
SELECT
  cohort,
  COALESCE(district, admin3)                            AS location,
  count(*)                                              AS n_submissions,
  round(sum(alive)::numeric / NULLIF(sum(planted),0),4) AS survival_rate
FROM hcs_submissions
GROUP BY cohort, COALESCE(district, admin3)
ORDER BY survival_rate;

-- ── 7. Verify ────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'hcs_%' ORDER BY table_name;
