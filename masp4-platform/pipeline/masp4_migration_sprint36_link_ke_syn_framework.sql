-- =============================================================
-- MASP IV Sprint 36 — link Synnefa Solidaridad P4G (KE-SYN-001) to its own measurement framework
-- Sheet: "P4G Measurement Framework", tab dashboard_input (gid 1616090258), built from 'performance_tracker':
-- 17 indicators, 6-monthly. Rules chosen by the user (2026-10-19): project start 1 Oct 2025, so progress after
-- 6 / 12 / 18 months = periods ending 2026-03 / 2026-09 / 2027-03; progress = new since baseline, against the
-- target; #11 / #12 (women in senior leadership / workforce) are percentages. Values are running (cumulative = Y).
-- Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1e0vnUGvE3yXjOSoXzDxCFyIJn-CFsH_ZWlzPZcj5jNw', 1616090258, 'dashboard_input',
       'project_mf_sheet_values', 'Synnefa P4G — Measurement Framework', '6-monthly'
FROM projects WHERE project_code = 'KE-SYN-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
