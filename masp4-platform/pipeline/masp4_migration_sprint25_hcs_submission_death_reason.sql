-- =============================================================
-- MASP IV Sprint 25 Migration — hcs_submissions death reason (schema drift fix)
--
-- pipeline/hc_survival/transform.py (since b7174bf, 2026-07-21) emits the
-- Uganda / Harvesting Carbon per-visit death reason on hcs_submissions rows:
--   reason_death         free text as entered
--   reason_death_bucket  bucketed (Drought/water stress, Livestock/animals, ...)
-- Sprint 18 only created these columns on hcs_species, so every load since then
-- failed with PGRST102 ("All object keys must match") and the tables stopped
-- refreshing after 2026-07-20. Kenya (SAVE KE) rows leave both NULL — the KE form
-- records death reasons per species (hcs_species.reason_death*).
--
-- Additive only. Idempotent: safe to re-run.
-- =============================================================

ALTER TABLE hcs_submissions ADD COLUMN IF NOT EXISTS reason_death        text;
ALTER TABLE hcs_submissions ADD COLUMN IF NOT EXISTS reason_death_bucket text;

COMMENT ON COLUMN hcs_submissions.reason_death IS
  'UG_HC only: per-visit reason for death/damage as entered. KE_SAVE records this per species in hcs_species.';
COMMENT ON COLUMN hcs_submissions.reason_death_bucket IS
  'UG_HC only: reason_death bucketed by transform.death_bucket().';

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='hcs_submissions' AND column_name LIKE 'reason_death%';
