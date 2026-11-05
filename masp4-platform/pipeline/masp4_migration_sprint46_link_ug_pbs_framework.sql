-- =============================================================
-- MASP IV Sprint 46 — link Piloting Bundled Services Uganda (UG-PBS-001) to its own measurement framework
-- Sheet: "Copy of 02072016_BundledServicesPilot_Workplan", tab dashboard_input (gid 1287373965), built from the
-- 'Resul Framework' tab (deliverables -> activities -> KPIs; no years, targets or achievement columns of its own).
-- User rules (2026-10-21): use the Result Framework tab; achievements are ANNUAL and split by bundle B1 / B2 / B3.
-- 15 activity KPIs (D1.1–D7.3) + 3 farmer-per-bundle indicators from the sheet's Key Considerations
-- (B1 7,000 / B2 5,000 / B3 3,000), periods 2026 and 2027. Indicator text is a formula linked to the Result
-- Framework (helper column rf_row); targets come from the KPI wording (single deliverables = 1, see target_basis);
-- the team types achievements into the yellow b1 / b2 / b3 cells and total = b1 + b2 + b3 (the split also shows
-- in the note). Synced nightly by .github/workflows/frameworks.yml; first copy (36 rows) loaded by SQL 2026-10-21.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1dz_D12kYzG9DXbYiUEa9xYji8mrp0ptx9Y5awW2Ab3A', 1287373965, 'dashboard_input',
       'project_mf_sheet_values', 'Bundled Services Pilot Uganda — Result Framework', 'annual'
FROM projects WHERE project_code = 'UG-PBS-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
