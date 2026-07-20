-- ============================================================================
-- MASP IV — Add Uganda projects + remove AFRI00 Kenya
-- Run in Supabase: SQL Editor → New query → paste → Run
-- Country/Commodity validated against enums in masp4_schema.sql:
--   country_enum   = Kenya, Uganda, Tanzania, Ethiopia
--   commodity_enum = Coffee, Tea, F&V, Gold, Dairy, Leather, Cotton,
--                    Fashion, Palm Oil, Cocoa
-- ON CONFLICT guard makes the inserts safe to re-run (idempotent on project_code).
-- ============================================================================

-- ── 1. Add new Uganda projects ───────────────────────────────────────────────
-- Codes follow the UG-XXX-NNN convention; none collides with existing rows.
-- (FVO ICAM was dropped: it duplicates the seeded UG-FVO-001 'FVO ICAM Cocoa
--  Project'. AFRI00 moves from Kenya to Uganda — added here, old Kenya row
--  removed in step 2.)
INSERT INTO projects (project_code, project_name, country, commodity, start_year, end_year) VALUES
('UG-UCL-001', 'UCLAP Project',                                                 'Uganda', 'Coffee', 2026, 2030),
('UG-PBS-001', 'Piloting Bundled Services for Smallholder Adaptation in Uganda','Uganda', 'Coffee', 2026, 2030),
('UG-AFR-001', 'AFRI00 Uganda',                                                 'Uganda', 'Tea',    2026, 2030)
ON CONFLICT (project_code) DO NOTHING;


-- ── 2. Delete AFRI00 Kenya (KE-AFR-001) ──────────────────────────────────────
-- ⚠ DESTRUCTIVE: project_kpi_targets is ON DELETE CASCADE, so this also removes
--   this project's seeded KPI targets (S6.1/S6.2/S2.1/S2.5) and any enrollments
--   or records linked to it. Review the pre-flight output before running.

-- Pre-flight: see exactly what will be removed.
SELECT 'project' AS kind, project_code, project_name, country::text, commodity::text
FROM projects WHERE project_code = 'KE-AFR-001'
UNION ALL
SELECT 'kpi_target', kt.kpi_code, kt.survey_year::text, kt.target_total::text, NULL
FROM project_kpi_targets kt
JOIN projects p ON p.id = kt.project_id
WHERE p.project_code = 'KE-AFR-001';

DELETE FROM projects WHERE project_code = 'KE-AFR-001';


-- ── 3. Re-seed AFRI00 KPI targets under UG-AFR-001 ───────────────────────────
-- Carried over 1:1 from the deleted KE-AFR-001 rows (2026: S6.1/S6.2/S2.1/S2.5).
-- ⚠ Values are the former Kenya targets — adjust if AFRI00 Uganda's logframe
--   targets differ.
INSERT INTO project_kpi_targets (project_id, survey_year, kpi_code, target_total, notes)
SELECT p.id, t.survey_year, t.kpi_code, t.target_total, t.notes
FROM (VALUES
  ('UG-AFR-001',2026,'S6.1', 2000, NULL),
  ('UG-AFR-001',2026,'S6.2', 2000, NULL),
  ('UG-AFR-001',2026,'S2.1', 2435, NULL),
  ('UG-AFR-001',2026,'S2.5', 1000, NULL)
) AS t(project_code, survey_year, kpi_code, target_total, notes)
JOIN projects p ON p.project_code = t.project_code;


-- ── 4. Verify ────────────────────────────────────────────────────────────────
-- New rows present:
SELECT project_code, project_name, country, commodity
FROM projects
WHERE project_code IN ('UG-UCL-001', 'UG-PBS-001', 'UG-AFR-001')
ORDER BY project_code;

-- AFRI00 Kenya gone (should return 0 rows):
SELECT project_code, project_name FROM projects WHERE project_code = 'KE-AFR-001';

-- AFRI00 Uganda KPI targets re-seeded (should return 4 rows):
SELECT p.project_code, kt.survey_year, kt.kpi_code, kt.target_total
FROM project_kpi_targets kt
JOIN projects p ON p.id = kt.project_id
WHERE p.project_code = 'UG-AFR-001'
ORDER BY kt.kpi_code;
