-- =============================================================
-- MASP IV Sprint 39 — link Crop+ CROP-SL Ethiopia (ET-CSL-001) to its own measurement framework
-- Sheet: "CROP+SL IPPT", tab dashboard_input (gid 694452480), built from 'IPTT Y2-2026': 28 indicators
-- (Outputs 1.1-3.1 + 3 network indicators), end target = EoP Target Value, one annual period Year 2 = 2026.
-- No achievements entered yet: dashboard_input's total / male / female / youth are formulas pointing at the
-- IPTT's 'Overall Achievement For Year 2' columns (AB-AE), so the nightly sync picks values up once the team
-- fills in the quarters. Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1V-gyvdn4sa7go3--MUKGMvAG0QwtJrHIEGfaEHsZZDo', 694452480, 'dashboard_input',
       'project_mf_sheet_values', 'Crop+ CROP-SL Ethiopia — IPTT Year 2 (2026)', 'annual'
FROM projects WHERE project_code = 'ET-CSL-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
