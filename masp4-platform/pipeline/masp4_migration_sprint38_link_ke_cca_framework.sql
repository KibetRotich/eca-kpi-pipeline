-- =============================================================
-- MASP IV Sprint 38 — link CCAC Livestock Methane Reduction Strategy (KE-CCA-001) to its own framework
-- Sheet: "25-026-KE-24-002_Report Jan-Jun2026_ Final report-signed", tab dashboard_input (gid 221786451), built
-- from '2. Narrative' (CCAC narrative report): 15 results (4 outcomes + 11 outputs), 6-monthly:
-- P1 = 24 Sep - 31 Dec 2025 (2025-12), P2 = 1 Jan - 30 Jun 2026 (2026-06).
-- User corrections (2026-10-19), made only in dashboard_input, not in the signed report: Outcome 1 counts
-- smallholder dairy farmers (not government entities); the person-hour outputs count people trained
-- (1.1 / 1.3 target 3,000; 2.2 / 3.2 people targets to confirm). Statuses and activity progress in the notes.
-- Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1wR5IgaDn6GdW7yev9pKsZqn2IipFGJoXF2jlblSd53A', 221786451, 'dashboard_input',
       'project_mf_sheet_values', 'CCAC Livestock Methane — Narrative report results (Jan–Jun 2026)', '6-monthly'
FROM projects WHERE project_code = 'KE-CCA-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
