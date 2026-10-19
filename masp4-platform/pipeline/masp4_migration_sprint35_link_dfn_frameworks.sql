-- =============================================================
-- MASP IV Sprint 35 — link Dream Fund / Climate Heroes Kenya (KE-DFN-001) and Uganda (UG-DFN-001)
-- to their own measurement frameworks.
-- Sheet: "20260205 NPL Climate Heroes - Annual Reporting 2025 - KPIs and Milestones"; tidy tabs
-- 'dashboard_input Kenya' (gid 381445983) and 'dashboard_input Uganda' (gid 1418579686), built from
-- 'Core KPIs Kenya' / 'Core KPIs Uganda': 20 measures each (I.1-I.3, LOC.1, OC.1-OC.2, OP.1.1-OP.2.2), 2022-2025.
-- Rules chosen by the user (2026-10-19), each country on its own: progress = the sheet's cumulative result per
-- year (cumulative = Y); end target = 'Q1 2027 - End of Programme Plan' only (yearly plans in a reference column);
-- all measures listed, those still waiting for studies show as not yet reported.
-- No county tabs. Synced nightly by .github/workflows/frameworks.yml. Applied 2026-10-19.
-- =============================================================
INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1AMgWAgccdmHA0wzj21g04t1-iFq1nTdqJUJxhsdxeuQ', 381445983, 'dashboard_input Kenya',
       'project_mf_sheet_values', 'Climate Heroes Kenya — Core KPIs (Annual Reporting 2025)', 'annual'
FROM projects WHERE project_code = 'KE-DFN-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();

INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label, cadence)
SELECT id, '1AMgWAgccdmHA0wzj21g04t1-iFq1nTdqJUJxhsdxeuQ', 1418579686, 'dashboard_input Uganda',
       'project_mf_sheet_values', 'Climate Heroes Uganda — Core KPIs (Annual Reporting 2025)', 'annual'
FROM projects WHERE project_code = 'UG-DFN-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab, source_table = EXCLUDED.source_table,
      label = EXCLUDED.label, cadence = EXCLUDED.cadence, updated_at = now();
