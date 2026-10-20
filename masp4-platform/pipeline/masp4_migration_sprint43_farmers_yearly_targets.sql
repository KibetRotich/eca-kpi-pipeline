-- =============================================================
-- MASP IV Sprint 43 — yearly targets for the Network KPIs farmers timeline
-- User decisions (2026-10-20): the timeline compares cumulative yearly ACHIEVEMENTS (green, built from the
-- yearly values, not the sheets' EoP / overall figures) with cumulative yearly TARGETS (yellow), for farmers
-- trained only; the headline total keeps the EoP / overall figures; P2P annual targets may be used here.
-- dashboard_input gets an optional `target_period` column (target planned in the period) on the indicator
-- tagged farmers_trained. Loaded: TZ-P2P TZ-06 (IPTT "Targets - New", DB only: sheet is view-only for this
-- account), CSV-12, HAR 2.2, ANE 1.1.3, DFN KE/UG OP.1.1 (yearly increments of the cumulative plans).
-- KE-P2P left out: its only yearly targets (Targets_Plaza, 623,524 new) do not match its direct end target 101,550.
-- Applied 2026-10-20.
-- =============================================================
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS target_period numeric;

UPDATE project_mf_sheet_values v SET target_period = t.tp
FROM projects p, (VALUES
 ('TZ-P2P-001','TZ-06','2023-12',0),('TZ-P2P-001','TZ-06','2024-12',119996),('TZ-P2P-001','TZ-06','2025-12',119996),
 ('TZ-P2P-001','TZ-06','2026-12',30366),('TZ-P2P-001','TZ-06','2027-12',14693)
) AS t(code, iid, pe, tp)
WHERE p.id = v.project_id AND p.project_code = t.code AND v.indicator_id = t.iid AND v.period_end = t.pe;
