-- =============================================================
-- MASP IV Sprint 11 Migration
-- 1. Rename Pathways to Prosperity projects (Coffee)
-- 2. Add P2P Gold - Kenya and P2P Gold - Tanzania
-- Run once in Supabase SQL Editor
-- =============================================================

-- 1. Rename existing P2P projects
UPDATE projects
SET project_name = 'P2P Coffee - Kenya'
WHERE project_name ILIKE '%Pathways to Prosperity%Kenya%';

UPDATE projects
SET project_name = 'P2P Coffee - Tanzania'
WHERE project_name ILIKE '%Pathways to Prosperity%Tanzania%';

-- 2. Add P2P Gold - Kenya
INSERT INTO projects (project_code, project_name, country, commodity, active)
VALUES ('KE-P2G-001', 'P2P Gold - Kenya', 'Kenya', 'Gold', true)
ON CONFLICT (project_code) DO NOTHING;

-- 3. Add P2P Gold - Tanzania
INSERT INTO projects (project_code, project_name, country, commodity, active)
VALUES ('TZ-P2G-001', 'P2P Gold - Tanzania', 'Tanzania', 'Gold', true)
ON CONFLICT (project_code) DO NOTHING;

-- Verify
SELECT project_code, project_name, country, commodity, active
FROM projects
WHERE project_name ILIKE '%P2P%'
   OR project_name ILIKE '%Pathways%'
ORDER BY country, project_name;
