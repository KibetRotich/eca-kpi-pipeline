-- =============================================================
-- MASP IV Sprint 42 — Network KPIs "Farmers trained / reached" from the measurement frameworks
--
-- User decisions (2026-10-20): the dashboard figure is CUMULATIVE TO DATE and comes from each project's
-- measurement framework, replacing OUT.1; all references to OUT.1 are removed.
--
-- 1. network_kpi tag: each framework's dashboard_input tab gets a `network_kpi` column; the one indicator per
--    project that counts as unique farmers trained / reached is tagged 'farmers_trained'. The nightly sync
--    copies it into these columns, so the M&E team can move the tag in the sheet.
-- 2. OUT.1 retired: its indicators, values and KPI targets are copied to *_out1_archive tables, then deleted.
--    (project_mf_values rows go with their indicators via ON DELETE CASCADE.)
-- Additive + idempotent.
-- =============================================================
ALTER TABLE project_mf_sheet_values  ADD COLUMN IF NOT EXISTS network_kpi text;
ALTER TABLE save_mf_indicator_values ADD COLUMN IF NOT EXISTS network_kpi text;

CREATE TABLE IF NOT EXISTS project_mf_indicators_out1_archive AS
  SELECT *, now() AS archived_at FROM project_mf_indicators WHERE false;
CREATE TABLE IF NOT EXISTS project_mf_values_out1_archive AS
  SELECT v.*, now() AS archived_at FROM project_mf_values v WHERE false;
CREATE TABLE IF NOT EXISTS project_kpi_targets_out1_archive AS
  SELECT *, now() AS archived_at FROM project_kpi_targets WHERE false;
ALTER TABLE project_mf_indicators_out1_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_mf_values_out1_archive     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_kpi_targets_out1_archive   ENABLE ROW LEVEL SECURITY;

INSERT INTO project_mf_indicators_out1_archive
  SELECT *, now() FROM project_mf_indicators WHERE indicator_code = 'OUT.1';
INSERT INTO project_mf_values_out1_archive
  SELECT v.*, now() FROM project_mf_values v
  JOIN project_mf_indicators i ON i.id = v.indicator_id WHERE i.indicator_code = 'OUT.1';
INSERT INTO project_kpi_targets_out1_archive
  SELECT *, now() FROM project_kpi_targets WHERE kpi_code = 'OUT.1';

DELETE FROM project_mf_indicators WHERE indicator_code = 'OUT.1';
DELETE FROM project_kpi_targets   WHERE kpi_code = 'OUT.1';
