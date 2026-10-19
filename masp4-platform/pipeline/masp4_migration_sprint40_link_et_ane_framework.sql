-- =============================================================
-- MASP IV Sprint 40 — link Acting Now - Ethiopia (ET-ANE-001) to its own measurement framework
-- Sheet: "Acting_Now_IPTT", tab dashboard_input (gid 303011326), built from tabs IPTT Y1 / Y2 / Y3
-- (Year 1 = 2023, Year 2 = 2024, Year 3 = 2025): the 14 project indicators those tabs share, values = each tab's
-- 'Overall Achievement'. Rules chosen by the user (2026-10-19): Y1-Y3 only (IPTT Y4-2026 left out - its figures
-- are Y3's copied under a new indicator list); progress = sum of the years (per-year indicators).
-- Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1QxA6HVeO1Lx8C9j7Ufgm8ei0kbSmO-18UKHmcUzLrr4', 303011326, 'dashboard_input',
       'project_mf_sheet_values', 'Acting Now Ethiopia — IPTT Years 1–3 (2023–2025)', 'annual'
FROM projects WHERE project_code = 'ET-ANE-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
