-- ============================================================================
-- MASP IV — Per-KPI 2026 Annual Targets Seed
-- Source: KPI_Data_Cleaned_for_Looker CSV, year=2026, MASP IV indicators only
-- Run AFTER masp4_migration_sprint6.sql
-- ============================================================================

DELETE FROM project_kpi_targets WHERE survey_year = 2026;

INSERT INTO project_kpi_targets (project_id, survey_year, kpi_code, target_total, notes)
SELECT p.id, t.survey_year, t.kpi_code, t.target_total, t.notes
FROM (VALUES
-- ── Acting Now - Kenya (KE-ANK-001) ──────────────────────────────────────────
  ('KE-ANK-001',2026,'S6.1', 49000, NULL),
  ('KE-ANK-001',2026,'S6.2', 49000, NULL),
  ('KE-ANK-001',2026,'S2.1',  3000, NULL),
-- ── CCAC Livestock Methane (KE-CCA-001) ──────────────────────────────────────
  ('KE-CCA-001',2026,'S6.1',  2100, NULL),
  ('KE-CCA-001',2026,'S6.2',  4200, NULL),
  ('KE-CCA-001',2026,'S2.1',  1500, NULL),
  ('KE-CCA-001',2026,'S6.3',     1, NULL),
-- ── Creating Shared Value Maize (KE-CSV-001) ─────────────────────────────────
  ('KE-CSV-001',2026,'S2.1',  4200, 'S6.1/S6.2 not set in logframe'),
-- ── Dream Fund Kenya (KE-DFN-001) ────────────────────────────────────────────
  ('KE-DFN-001',2026,'S6.1',  5000, NULL),
  ('KE-DFN-001',2026,'S6.2',  5000, NULL),
  ('KE-DFN-001',2026,'S2.1',  5000, NULL),
  ('KE-DFN-001',2026,'S2.5',  5000, NULL),
  ('KE-DFN-001',2026,'S6.3',     1, NULL),
  ('KE-DFN-001',2026,'S6.4',     1, NULL),
  ('KE-DFN-001',2026,'S6.5',     1, NULL),
-- ── Pathways to Prosperity Kenya (KE-P2P-001) ────────────────────────────────
  ('KE-P2P-001',2026,'S6.1',149500, NULL),
  ('KE-P2P-001',2026,'S6.2',127075, NULL),
  ('KE-P2P-001',2026,'S2.1',281884, NULL),
  ('KE-P2P-001',2026,'S2.5', 97795, NULL),
  ('KE-P2P-001',2026,'S6.3',     2, NULL),
  ('KE-P2P-001',2026,'S6.4',     2, NULL),
  ('KE-P2P-001',2026,'S6.5',     2, NULL),
-- ── Shade for Vegetables (KE-SVP-001) ────────────────────────────────────────
  ('KE-SVP-001',2026,'S6.1',  2000, NULL),
  ('KE-SVP-001',2026,'S6.2',  2000, NULL),
  ('KE-SVP-001',2026,'S2.1',  2000, NULL),
  ('KE-SVP-001',2026,'S2.5',  2000, NULL),
-- ── Synnefa P4G (KE-SYN-001) ─────────────────────────────────────────────────
  ('KE-SYN-001',2026,'S6.1',   560, NULL),
  ('KE-SYN-001',2026,'S6.2',   560, NULL),
  ('KE-SYN-001',2026,'S2.1',   560, NULL),
  ('KE-SYN-001',2026,'S6.3',     1, NULL),
  ('KE-SYN-001',2026,'S6.5',     1, NULL),
-- ── Acting Now Ethiopia (ET-ANE-001) ─────────────────────────────────────────
  ('ET-ANE-001',2026,'S6.1', 20000, NULL),
  ('ET-ANE-001',2026,'S6.2', 20000, NULL),
  ('ET-ANE-001',2026,'S2.1',  1200, NULL),
-- ── Pathways to Prosperity Tanzania (TZ-P2P-001) ─────────────────────────────
  ('TZ-P2P-001',2026,'S6.1', 16244, NULL),
  ('TZ-P2P-001',2026,'S6.2', 20084, NULL),
  ('TZ-P2P-001',2026,'S2.1',105700, NULL),
  ('TZ-P2P-001',2026,'S2.5',  3748, NULL),
  ('TZ-P2P-001',2026,'S6.3',     5, NULL),
  ('TZ-P2P-001',2026,'S6.4',     2, NULL),
  ('TZ-P2P-001',2026,'S6.5',     2, NULL),
-- ── AFRI00 Uganda (UG-AFR-001) ───────────────────────────────────────────────
  ('UG-AFR-001',2026,'S6.1',  2000, NULL),
  ('UG-AFR-001',2026,'S6.2',  2000, NULL),
  ('UG-AFR-001',2026,'S2.1',  2435, NULL),
  ('UG-AFR-001',2026,'S2.5',  1000, NULL),
-- ── Dreamfund ECA Uganda (UG-DFN-001) ────────────────────────────────────────
  ('UG-DFN-001',2026,'S6.1', 45000, NULL),
  ('UG-DFN-001',2026,'S6.2', 45000, NULL),
  ('UG-DFN-001',2026,'S2.1', 52067, NULL),
  ('UG-DFN-001',2026,'S2.5', 45000, NULL),
  ('UG-DFN-001',2026,'S6.3',     1, NULL),
  ('UG-DFN-001',2026,'S6.4',     1, NULL),
  ('UG-DFN-001',2026,'S6.5',     1, NULL),
-- ── FVO ICAM Cocoa (UG-FVO-001) ──────────────────────────────────────────────
  ('UG-FVO-001',2026,'S6.1',   630, NULL),
  ('UG-FVO-001',2026,'S6.2',   630, NULL),
  ('UG-FVO-001',2026,'S2.1',  1260, NULL),
  ('UG-FVO-001',2026,'S6.5',     1, NULL),
-- ── Harvesting Carbon Uganda (UG-HAR-001) ────────────────────────────────────
  ('UG-HAR-001',2026,'S6.1',  4500, NULL),
  ('UG-HAR-001',2026,'S6.2',  6300, NULL),
  ('UG-HAR-001',2026,'S2.1',  3230, NULL),
  ('UG-HAR-001',2026,'S6.3',     1, NULL),
  ('UG-HAR-001',2026,'S6.4',     1, NULL),
  ('UG-HAR-001',2026,'S6.5',     2, NULL),
-- ── NOPP Uganda (UG-NOP-001) ─────────────────────────────────────────────────
  ('UG-NOP-001',2026,'S6.1',  9800, NULL),
  ('UG-NOP-001',2026,'S6.2', 14480, NULL),
  ('UG-NOP-001',2026,'S6.4',  3120, NULL),
-- ── REAP Uganda (UG-REA-001) ─────────────────────────────────────────────────
  ('UG-REA-001',2026,'S6.1', 10000, NULL),
  ('UG-REA-001',2026,'S6.2', 10000, NULL),
  ('UG-REA-001',2026,'S2.1', 10000, NULL),
  ('UG-REA-001',2026,'S6.3',     1, NULL),
  ('UG-REA-001',2026,'S6.4',     1, NULL),
-- ── Starbucks Uganda (UG-STB-001) ────────────────────────────────────────────
  ('UG-STB-001',2026,'S2.1',    28, NULL),
  ('UG-STB-001',2026,'S6.4',     2, NULL),
  ('UG-STB-001',2026,'S6.5',     2, NULL),
-- ── Root causes child labour Uganda (UG-RCL-001) ─────────────────────────────
  ('UG-RCL-001',2026,'S2.1',   800, NULL),
  ('UG-RCL-001',2026,'S6.3',     3, NULL)
) AS t(project_code, survey_year, kpi_code, target_total, notes)
JOIN projects p ON p.project_code = t.project_code;
