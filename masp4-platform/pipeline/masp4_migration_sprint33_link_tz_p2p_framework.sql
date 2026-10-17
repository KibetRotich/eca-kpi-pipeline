-- =============================================================
-- MASP IV Sprint 33 — link P2P Coffee Tanzania to its measurement framework
-- Sheet: "P2P Coffee & MASP IV KPIs - Tanzania", tab dashboard_input (gid 208636087),
-- built from "IPTT - P2P Coffee": annual 2023-2029, 17 indicators.
-- Rule chosen by the user (2026-10-17): achievement = New + Continued;
-- end target = "Total target 2023-2029 (New + Continued)" from the sheet
-- (recomputed from the yearly columns only where the sheet total is #REF!).
-- No county tabs. Synced nightly by .github/workflows/frameworks.yml.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '113cNKWL11KUkX5byKbRicmrXqywusyElMZtkxenOdy4', 208636087, 'dashboard_input',
       'project_mf_sheet_values', 'P2P Coffee Tanzania — Indicator Tracking Table', 'annual'
FROM projects WHERE project_code = 'TZ-P2P-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
