-- =============================================================
-- MASP IV Sprint 30 Migration — gender & youth of SAVE farmers reached
--
-- One-row view behind the "Gender and youth of farmers reached" donuts in the
-- Shade for Vegetables (KE-SVP-001) window on /targets. Same rule as the
-- Summary dashboard donuts of the SAVE KE Seedlings Distribution dashboard:
-- a farmer is "reached" once they received seedlings (real event, > 0
-- seedlings); gender / age group come from the profiled-farmer register
-- (Sprint 26), matched on beneficiary ID; reached farmers missing from the
-- register are counted as not_in_register, so every row sums to farmers reached.
-- Aggregate counts only. Additive + idempotent.
-- =============================================================

CREATE OR REPLACE VIEW v_save_dist_reached_gender_youth WITH (security_invoker = true) AS
WITH reached AS (
  SELECT DISTINCT upper(f.beneficiary_id) AS beneficiary_id
  FROM save_dist_farmer_entries f
  JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
  WHERE NOT e.is_test AND coalesce(f.total_seedlings, 0) > 0 AND f.beneficiary_id IS NOT NULL
)
SELECT count(*)                                                         AS farmers_reached,
       count(*) FILTER (WHERE p.gender = 'female')                       AS women,
       count(*) FILTER (WHERE p.gender = 'male')                         AS men,
       count(*) FILTER (WHERE p.beneficiary_id IS NOT NULL
                          AND coalesce(p.gender, '') NOT IN ('female', 'male')) AS gender_other,
       count(*) FILTER (WHERE p.age_group = 'youth')                     AS youth,
       count(*) FILTER (WHERE p.beneficiary_id IS NOT NULL
                          AND coalesce(p.age_group, '') <> 'youth')     AS non_youth,
       count(*) FILTER (WHERE p.beneficiary_id IS NULL)                  AS not_in_register
FROM reached r
LEFT JOIN save_dist_profiled_farmers p ON p.beneficiary_id = r.beneficiary_id;
