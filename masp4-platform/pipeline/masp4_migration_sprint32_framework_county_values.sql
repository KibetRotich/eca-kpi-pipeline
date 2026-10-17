-- =============================================================
-- MASP IV Sprint 32 Migration — county breakdown for Google-Sheet frameworks
--
-- Some project frameworks (P2P Coffee Kenya) keep one IPTT tab per county with
-- yearly achievements. project_mf_sheets.county_tabs lists those tabs; the nightly
-- sync (pipeline/frameworks/sync_framework_sheets.py) parses them into
-- project_mf_sheet_county_values, matching indicators to the framework by name.
-- The /targets project window then shows one "achievement per year" chart per
-- county. There are no county targets in the sheets — county charts show
-- achievement only; the overall chart uses the Direct end target.
-- Additive + idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS project_mf_sheet_county_values (
  project_id     uuid    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  county         text    NOT NULL,
  indicator_id   text    NOT NULL,
  period_end     text    NOT NULL CHECK (period_end ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  total          numeric,
  male           numeric,
  female         numeric,
  youth          numeric,
  non_individual numeric,
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (project_id, county, indicator_id, period_end)
);
ALTER TABLE project_mf_sheet_county_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_mf_sheet_county_values_sel ON project_mf_sheet_county_values;
CREATE POLICY project_mf_sheet_county_values_sel ON project_mf_sheet_county_values FOR SELECT TO authenticated USING (true);

ALTER TABLE project_mf_sheets ADD COLUMN IF NOT EXISTS county_tabs text[] NOT NULL DEFAULT '{}';

UPDATE project_mf_sheets s
SET county_tabs = ARRAY['Bungoma', 'Bomet', 'Kericho', 'Kisii', 'Nandi', 'Nyamira', 'Transnzoia', 'West Pokot']
FROM projects p WHERE p.id = s.project_id AND p.project_code = 'KE-P2P-001';
