-- =============================================================
-- MASP IV Sprint 41 — link Starbucks Uganda (UG-STB-001) to its own measurement framework
-- Sheet: "Starbucks project", tab dashboard_input (gid 1571841214), built from 'IPTT 2024-2025' deliverables:
-- 22 tasks (global + East Africa / Uganda rows; the Peru and Honduras duplicates left out), 2024 / 2025 / 2026.
-- Rules chosen by the user (2026-10-19): IPTT deliverables, not the MASP & PLAZA KPIs; no end targets added (only
-- the IPTT's own target of 1 for the baseline report). Yearly totals are formulas linked to the IPTT's achievement
-- columns (AQ / AY / BG), so new entries flow in. Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1R4xIZLITLlFG8VJDQXe3wCzH-47AmmR_rMvkcROJeG4', 1571841214, 'dashboard_input',
       'project_mf_sheet_values', 'Starbucks Uganda — IPTT 2024–2026 deliverables', 'annual'
FROM projects WHERE project_code = 'UG-STB-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
