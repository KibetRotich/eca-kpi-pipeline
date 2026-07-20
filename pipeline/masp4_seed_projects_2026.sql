-- ============================================================================
-- MASP IV — Real Projects + 2026 Annual Targets Seed
-- Source: KPI_Data_Cleaned_for_Looker - KPI_Data_Cleaned_for_Looker.csv
--         Filtered to projects with 2026 survey data (18 projects)
-- Apply in Supabase: SQL Editor → New query → paste → Run
-- ============================================================================

-- ── 0. Ensure commodity_enum has all required values ─────────────────────────
-- ADD VALUE IF NOT EXISTS is safe to re-run; it is a no-op when the value
-- already exists. Must run OUTSIDE a transaction block in Supabase SQL Editor.
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Coffee';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Tea';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'F&V';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Gold';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Dairy';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Leather';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Cotton';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Fashion';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Palm Oil';
ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS 'Cocoa';


-- ── 1. Clear placeholder projects ────────────────────────────────────────────
-- (Only safe to run on a fresh platform before any submissions are approved)
DELETE FROM projects;


-- ── 2. Insert real ECA programme projects (2026 survey cohort) ───────────────
INSERT INTO projects (project_code, project_name, country, commodity, start_year, end_year) VALUES

-- Kenya
('KE-ANK-001', 'Acting Now - Kenya',                                                   'Kenya',    'F&V',      2026, 2030),
('KE-CCA-001', 'CCAC Livestock Methane Reduction Strategy',                            'Kenya',    'Dairy',    2026, 2030),
('KE-CSV-001', 'Creating Shared Value in Maize Value Chain in Kenya',                  'Kenya',    'F&V',      2026, 2030),
('KE-DFN-001', 'Dream Fund Kenya (Climate Heroes)',                                    'Kenya',    'Coffee',   2026, 2030),
('KE-P2P-001', 'Pathways to Prosperity - Kenya',                                       'Kenya',    'Coffee',   2026, 2030),
('KE-SVP-001', 'Shade for Vegetables Project Kenya',                                   'Kenya',    'F&V',      2026, 2030),
('KE-SYN-001', 'Synnefa Solidaridad P4G Project',                                      'Kenya',    'F&V',      2026, 2030),

-- Ethiopia
('ET-ANE-001', 'Acting Now - Ethiopia',                                                'Ethiopia', 'F&V',      2026, 2030),
('ET-CSL-001', 'Crop+ CROSL Ethiopia',                                                 'Ethiopia', 'F&V',      2026, 2030),

-- Tanzania
('TZ-GOL-001', 'Gold ECA FVO Project - Responsible ASGM Trade',                       'Tanzania', 'Gold',     2026, 2030),
('TZ-P2P-001', 'Pathways to Prosperity - Tanzania',                                   'Tanzania', 'Coffee',   2026, 2030),

-- Uganda
('UG-AFR-001', 'AFRI00 Uganda',                                                        'Uganda',   'Tea',      2026, 2030),
('UG-DFN-001', 'Dreamfund ECA Uganda project',                                        'Uganda',   'Coffee',   2026, 2030),
('UG-FVO-001', 'FVO ICAM Cocoa Project',                                               'Uganda',   'Cocoa',    2026, 2030),
('UG-HAR-001', 'Harvesting Carbon: Carbon Mitigation DGBP Uganda',                    'Uganda',   'Coffee',   2026, 2030),
('UG-NOP-001', 'NOPP Project Uganda',                                                  'Uganda',   'Palm Oil', 2026, 2030),
('UG-REA-001', 'Resilient Agroforestry Extension Project (REAP)',                      'Uganda',   'Coffee',   2026, 2030),
('UG-STB-001', 'Starbucks Uganda project',                                             'Uganda',   'Coffee',   2026, 2030),
('UG-RCL-001', 'The root causes of child labour - Uganda',                            'Uganda',   'Coffee',   2026, 2030);


-- ── Verification query ────────────────────────────────────────────────────────
-- SELECT project_code, project_name, country, commodity FROM projects ORDER BY country, project_code;
