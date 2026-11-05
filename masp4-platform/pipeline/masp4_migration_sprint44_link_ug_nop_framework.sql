-- =============================================================
-- MASP IV Sprint 44 — link NOPP Uganda (UG-NOP-001) to its own measurement framework
-- REVISED 2026-10-21 (same day): the user replaced the first source (sheet 1oldOdtW… 'IPTT 2024-2026', 28 indicators,
-- no achievements) with the contract workplan "Solidaridad_ NOPP Proposed work schedule-Harmonised with Contract
-- Schedule Final" (sheet 16gpVGRQ…). Its 'Framework' tab is the measurement framework: 8 outputs with Overall target /
-- Achieved / Remaining / Progress. Tab dashboard_input (gid 803060821) mirrors those 8 rows with formulas (helper column
-- fw_row); progress = overall_achievement (the tab's "Achieved"), one period 2026, cumulative = Y. The 'Proposed workplan'
-- activities and quarterly Schedule of Deliverables are not loaded. The 84 IPTT rows were deleted from
-- project_mf_sheet_values. Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-21.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '16gpVGRQrbH_K9J2HKZbraV2A67q-QSCa54icm5WQTHY', 803060821, 'dashboard_input',
       'project_mf_sheet_values', 'NOPP Uganda — Output framework (contract workplan)', 'annual'
FROM projects WHERE project_code = 'UG-NOP-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
