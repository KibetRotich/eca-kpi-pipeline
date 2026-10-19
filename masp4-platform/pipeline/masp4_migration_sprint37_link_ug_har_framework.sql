-- =============================================================
-- MASP IV Sprint 37 — link Harvesting Carbon: Carbon Mitigation DGBP Uganda (UG-HAR-001) to its own framework
-- Sheet: "Targets Versus Achieved. As at May 2026 xlsx", tab dashboard_input (gid 581515479), built from
-- 'Implementation Targets ': 33 indicators (Outputs 1-8, LDC and Solidaridad), annual 2024 / 2025 / 2026 (to May).
-- Rules chosen by the user (2026-10-19): progress = the sheet's 'Overall achievement so far' where given
-- (overall_achievement -> overall_total); otherwise the years are added up (cumulative = N) or the latest value is
-- used (cumulative = Y); 2026 runs to May and is shown as a provisional 2026.
-- Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19. Additive + idempotent.
-- =============================================================
ALTER TABLE project_mf_sheet_values ADD COLUMN IF NOT EXISTS overall_total numeric;

INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1Gsi8Qs4beyUvkSfxwZ8_PLXoYG2tOi5vxaZYTp3Q9Uk', 581515479, 'dashboard_input',
       'project_mf_sheet_values', 'Harvesting Carbon Uganda — Targets vs Achieved (as at May 2026)', 'annual'
FROM projects WHERE project_code = 'UG-HAR-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
