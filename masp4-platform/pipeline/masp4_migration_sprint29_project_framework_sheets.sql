-- =============================================================
-- MASP IV Sprint 29 Migration — Google-Sheet measurement frameworks on /targets
--
-- Some projects keep their logframe in a Google Sheet (edited by the M&E team).
-- project_mf_sheets links such a project to its sheet; the Targets page then
-- shows that framework in the project's window exactly like tab 8 of the
-- Seedlings dashboard (scorecard, progress graphs, embedded editable sheet).
--
-- First link: Shade for Vegetables Project Kenya (KE-SVP-001) -> the SAVE
-- Project M&E Framework, tab "dashboard_input". Its values are the same
-- save_mf_indicator_values rows (Sprint 27) refreshed nightly from the sheet by
-- .github/workflows/save_seedlings.yml, so tab 8 and the Targets page always agree.
--
-- v_save_dist_seedlings_by_period: seedlings handed out on the Kobo
-- distribution form, cumulative up to each reporting month (the cross-check
-- line on the "trees planted" graph).
-- Additive + idempotent.
-- =============================================================

CREATE TABLE IF NOT EXISTS project_mf_sheets (
  project_id    uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  sheet_id      text NOT NULL,
  gid           bigint NOT NULL,
  tab           text NOT NULL,
  source_table  text NOT NULL CHECK (source_table IN ('save_mf_indicator_values')),
  label         text,
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE project_mf_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_mf_sheets_sel ON project_mf_sheets;
CREATE POLICY project_mf_sheets_sel ON project_mf_sheets FOR SELECT TO authenticated USING (true);

INSERT INTO project_mf_sheets (project_id, sheet_id, gid, tab, source_table, label)
SELECT id, '1tAW3zllJ1UYYIbMl5XTqVQhN8MBXrcFRKMm3erD1aN4', 2028076445, 'dashboard_input',
       'save_mf_indicator_values', 'SAVE Project M&E Framework'
FROM projects WHERE project_code = 'KE-SVP-001'
ON CONFLICT (project_id) DO UPDATE
  SET sheet_id = EXCLUDED.sheet_id, gid = EXCLUDED.gid, tab = EXCLUDED.tab,
      source_table = EXCLUDED.source_table, label = EXCLUDED.label, updated_at = now();

CREATE OR REPLACE VIEW v_save_dist_seedlings_by_period WITH (security_invoker = true) AS
WITH p AS (SELECT DISTINCT period_end FROM save_mf_indicator_values),
     d AS (
       SELECT to_char(e.started_at AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM') AS ym, f.total_seedlings
       FROM save_dist_farmer_entries f
       JOIN save_dist_events e ON e.kobo_id = f.event_kobo_id
       WHERE NOT e.is_test AND coalesce(f.total_seedlings, 0) > 0
     )
SELECT p.period_end, coalesce(sum(d.total_seedlings), 0)::bigint AS seedlings_distributed_cum
FROM p LEFT JOIN d ON d.ym <= p.period_end
GROUP BY p.period_end;
