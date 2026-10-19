-- =============================================================
-- MASP IV Sprint 34 — link Creating Shared Value in Maize Kenya (KE-CSV-001) to its own measurement framework
-- Sheet: "csv_achievement_tracker", tab dashboard_input (gid 1840512026),
-- built from 'yearly_achievemnt': annual 2022-2025, 40 indicators (Impact / Outcome 1-4 / Output 1.1-4.3).
-- Its own rules (not P2P's): end target = sheet "Final Target"; breakdown = the sheet's Male / Female / Youth.
-- Rule chosen by the user (2026-10-19): the sheet's "2025 EoP Achievement" is the project total, because the
-- yearly figures count returning farmers again. 2022-24 are loaded as reported; 2025 = EoP minus 2022-24 where
-- that is positive, else blank. The EoP (and its M/F/Y) is carried on every row of the indicator in
-- eop_achievement / eop_male / eop_female / eop_youth, and /targets uses it for progress and the gender pie.
-- No county tabs. Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- Additive + idempotent.
-- =============================================================
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS eop_total  numeric;
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS eop_male   numeric;
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS eop_female numeric;
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS eop_youth  numeric;

INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1bZmpAbBOWXv5eM6U3p3RuC7XQW40v-ZvHglONgLTI84', 1840512026, 'dashboard_input',
       'project_mf_sheet_values', 'CSV Maize Kenya — Achievement Tracker', 'annual'
FROM projects WHERE project_code = 'KE-CSV-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
