-- =============================================================
-- MASP IV Sprint 31 Migration — Google-Sheet frameworks for any project
--
-- Generalises Sprint 29 so every project can have its measurement framework in a
-- Google Sheet and show it in its window on /targets (same view as Seedlings tab 8):
--   project_mf_sheet_values  one row per project x indicator x period, loaded
--                            nightly from each linked sheet's tidy tab by
--                            pipeline/frameworks/sync_framework_sheets.py
--   project_mf_sheets        + cadence ('6-monthly' | 'annual'), extras (project-
--                            specific add-ons), last_synced_at / last_error
-- KE-SVP-001 (SAVE) keeps reading save_mf_indicator_values, with its extras
-- (Kobo cross-check line, register gender / youth donuts).
-- New link: KE-P2P-001 P2P Coffee - Kenya -> "P2P Indicator Tracking Table",
-- tab dashboard_input (annual, 2024-2029).
-- Additive + idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS project_mf_sheet_values (
  project_id     uuid    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  indicator_id   text    NOT NULL,
  period_end     text    NOT NULL CHECK (period_end ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  level          text,
  indicator      text,
  unit           text,
  baseline       numeric,
  end_target     numeric,
  target_direct  numeric,
  cumulative     boolean,
  period_label   text,
  total          numeric,
  male           numeric,
  female         numeric,
  youth          numeric,
  survival_pct   numeric,
  non_individual numeric,
  note           text,
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, indicator_id, period_end)
);
ALTER TABLE project_mf_sheet_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_mf_sheet_values_sel ON project_mf_sheet_values;
CREATE POLICY project_mf_sheet_values_sel ON project_mf_sheet_values FOR SELECT TO authenticated USING (true);

ALTER TABLE project_mf_sheets DROP CONSTRAINT IF EXISTS project_mf_sheets_source_table_check;
ALTER TABLE project_mf_sheets ADD CONSTRAINT project_mf_sheets_source_table_check
  CHECK (source_table IN ('save_mf_indicator_values', 'project_mf_sheet_values'));
ALTER TABLE project_mf_sheets ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT '6-monthly'
  CHECK (cadence IN ('6-monthly', 'annual'));
ALTER TABLE project_mf_sheets ADD COLUMN IF NOT EXISTS extras text[] NOT NULL DEFAULT '{}';
ALTER TABLE project_mf_sheets ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE project_mf_sheets ADD COLUMN IF NOT EXISTS last_error text;

UPDATE project_mf_sheets s SET extras = ARRAY['save_kobo_reference', 'save_reached'], cadence = '6-monthly'
FROM projects p WHERE p.id = s.project_id AND p.project_code = 'KE-SVP-001';

INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1uRf0PgB2SMCMTGvbCCs7MZTMlKArh575lL9tf2-KcZU', 235208945, 'dashboard_input',
       'project_mf_sheet_values', 'P2P Coffee Kenya — Indicator Tracking Table', 'annual'
FROM projects WHERE project_code = 'KE-P2P-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
