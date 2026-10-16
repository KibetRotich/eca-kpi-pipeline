-- =============================================================
-- MASP IV Sprint 26 Migration — SAVE KE profiled-farmer register
-- Source: Google Sheet "SAVE KE Profiled Farmers Summary 20241015"
--         (1nWQwYcmygu2aeEJLIUq-bVirMLtF-OVZgrTRoEAl19E, tab "in")
-- Additive only. Feeds the "Profiled vs reached" panel of the SAVE KE Seedlings
-- Distribution dashboard (pipeline/save_seedlings).
--
-- PII: first_name, other_names, registration GPS and enumerator_names are NOT
-- loaded — fetch_profiled.py drops them before anything is written. Only the
-- pseudonymous Solidaridad beneficiary ID is kept, to match distributions.
--
-- RLS as Sprint 24 (save_dist_*): authenticated read only; ETL writes with the
-- service role. Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS save_dist_profiled_farmers (
  beneficiary_id  text        PRIMARY KEY,      -- sol_beneficiary_id (upper-cased)
  register_id     text,                         -- sheet "id" column
  gender          text,                         -- female / male / rather_not_say
  birth_year      int,
  age_group       text,                         -- youth / non_youth
  county          text,                         -- admin_level_1
  sub_county      text,                         -- admin_level_2 (spelling-normalised)
  ward            text,                         -- admin_level_3 (title-cased)
  village         text,
  cooperative     text,
  total_plots     int,
  approved_plots  int,
  rejected_plots  int,
  in_project_area boolean,                      -- ward is one of the distribution wards
  source_sheet    text,
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS save_dist_pf_ward_idx ON save_dist_profiled_farmers (ward);

ALTER TABLE save_dist_profiled_farmers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS save_dist_profiled_farmers_sel ON save_dist_profiled_farmers;
CREATE POLICY save_dist_profiled_farmers_sel ON save_dist_profiled_farmers
  FOR SELECT TO authenticated USING (true);

-- Coverage: profiled farmers vs those who received seedlings (any round)
CREATE OR REPLACE VIEW v_save_dist_profiled_coverage WITH (security_invoker = true) AS
WITH reached AS (
  SELECT DISTINCT upper(f.beneficiary_id) AS beneficiary_id
  FROM save_dist_farmer_entries f
  JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
  WHERE NOT e.is_test AND coalesce(f.total_seedlings, 0) > 0
)
SELECT p.sub_county, p.ward,
       count(*)                                         AS profiled,
       count(r.beneficiary_id)                          AS reached,
       round(100.0 * count(r.beneficiary_id) / count(*), 1) AS pct_reached,
       count(*) FILTER (WHERE p.gender = 'female')      AS profiled_female,
       count(r.beneficiary_id) FILTER (WHERE p.gender = 'female') AS reached_female,
       count(*) FILTER (WHERE p.age_group = 'youth')    AS profiled_youth,
       count(r.beneficiary_id) FILTER (WHERE p.age_group = 'youth') AS reached_youth
FROM save_dist_profiled_farmers p
LEFT JOIN reached r ON r.beneficiary_id = p.beneficiary_id
GROUP BY p.sub_county, p.ward;

ALTER TABLE save_dist_sync_meta ADD COLUMN IF NOT EXISTS n_profiled int;
ALTER TABLE save_dist_sync_meta ADD COLUMN IF NOT EXISTS profiled_synced_at timestamptz;
