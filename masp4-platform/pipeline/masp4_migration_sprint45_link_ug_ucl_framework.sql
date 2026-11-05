-- =============================================================
-- MASP IV Sprint 45 — link UCLAP Uganda (UG-UCL-001) to its measurement framework
-- Sheet: "UCLAP 2027 Updated LF, Indicator Performance Tracking Table and Dashboard", tab 'UCLAP IPTT' (gid 976985822):
-- 9 indicators (1 impact, 2 outcome, 6 output) x 2026 / 2027 / 2028. End target = the IPTT's "Cummulative Target";
-- the IPTT's yearly targets are kept in each row's note. % indicators cumulative = Y (latest year); counts = N
-- (the IPTT's own cumulative achievement is 2026 + 2027 + 2028).
-- Tab dashboard_input (gid 1296834833) added 2026-10-21 once edit rights were given: every cell is a formula linked
-- to the IPTT through the helper column iptt_row (% stored as fractions are scaled x100). Synced nightly by
-- .github/workflows/frameworks.yml; the first copy (27 rows) was loaded by SQL the same day.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1hbImpcm2cehcoxeOuzD6IEhQB05bQmAIhiAfWANjEo8', 1296834833, 'dashboard_input',
       'project_mf_sheet_values', 'UCLAP Uganda — IPTT 2026–2028', 'annual'
FROM projects WHERE project_code = 'UG-UCL-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
