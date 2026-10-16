-- =============================================================
-- MASP IV Sprint 28 Migration — per-project Measurement Framework
--
-- Replaces the Targets page's "OUTPUT (quarterly)" and "REC Level Indicators"
-- sections with a per-project logframe: each project defines its own
-- indicators (level, unit, baseline, end-of-project target, yearly targets,
-- cumulative Y/N) and records values every 6 months (June / December) with
-- total / female / male / youth.
--
-- Conversion (this file): the existing output data is copied in —
--   project_output_records (farmers trained, quarterly)  -> indicator OUT.1
--   project_output_kpi_records (OUT.2 / .3 / .4 / .6)     -> one indicator per code
--   quarters 1+2 -> period 'YYYY-06', quarters 3+4 -> 'YYYY-12' (summed)
--   project_kpi_targets OUT.* annual targets              -> annual_targets
-- The source tables are NOT modified or dropped (kept as the pre-conversion
-- record). project_rec_records never existed, so there is no REC data to move.
--
-- Additive + idempotent (ON CONFLICT DO NOTHING): safe to re-run.
-- RLS: authenticated read; the app writes through /api/framework with the
-- service role behind requireEditor (admin / me_officer).
-- =============================================================

CREATE TABLE IF NOT EXISTS project_mf_indicators (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  indicator_code  text        NOT NULL,                 -- e.g. OUT.1, SVP-03
  level           text,                                 -- Goal / Outcome / Output
  indicator       text        NOT NULL,
  unit            text,
  baseline        numeric,
  end_target      numeric,                              -- end-of-project target
  annual_targets  jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- {"2026": {"total":1200,"female":600,"male":600}}
  cumulative      boolean,                              -- true: running total; false: per period (summed); null: unconfirmed
  sort_order      int         NOT NULL DEFAULT 100,
  source          text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (project_id, indicator_code)
);
CREATE INDEX IF NOT EXISTS project_mf_ind_project_idx ON project_mf_indicators (project_id);

CREATE TABLE IF NOT EXISTS project_mf_values (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  indicator_id  uuid        NOT NULL REFERENCES project_mf_indicators(id) ON DELETE CASCADE,
  period_end    text        NOT NULL CHECK (period_end ~ '^[0-9]{4}-(06|12)$'),   -- 6-monthly: June / December
  total         numeric     CHECK (total  IS NULL OR total  >= 0),
  female        numeric     CHECK (female IS NULL OR female >= 0),
  male          numeric     CHECK (male   IS NULL OR male   >= 0),
  youth         numeric     CHECK (youth  IS NULL OR youth  >= 0),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (indicator_id, period_end)
);
CREATE INDEX IF NOT EXISTS project_mf_val_ind_idx ON project_mf_values (indicator_id);

ALTER TABLE project_mf_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_mf_values     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_mf_indicators_sel ON project_mf_indicators;
DROP POLICY IF EXISTS project_mf_values_sel     ON project_mf_values;
CREATE POLICY project_mf_indicators_sel ON project_mf_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY project_mf_values_sel     ON project_mf_values     FOR SELECT TO authenticated USING (true);

-- ── Conversion 1: OUT.1 farmers / miners trained (quarterly -> 6-monthly) ──
INSERT INTO project_mf_indicators (project_id, indicator_code, level, indicator, unit, cumulative, annual_targets, sort_order, source)
SELECT p.id, 'OUT.1', 'Output',
       CASE WHEN p.commodity::text = 'Gold' THEN 'Miners trained / reached' ELSE 'Farmers trained / reached' END,
       CASE WHEN p.commodity::text = 'Gold' THEN 'miners' ELSE 'farmers' END,
       false,
       COALESCE((SELECT jsonb_object_agg(t.survey_year::text,
                          jsonb_strip_nulls(jsonb_build_object('total', t.target_total, 'female', t.target_female, 'male', t.target_male)))
                 FROM project_kpi_targets t WHERE t.project_id = p.id AND t.kpi_code = 'OUT.1'), '{}'::jsonb),
       10, 'converted from project_output_records (Sprint 28)'
FROM projects p
WHERE EXISTS (SELECT 1 FROM project_output_records o WHERE o.project_id = p.id)
   OR EXISTS (SELECT 1 FROM project_kpi_targets t WHERE t.project_id = p.id AND t.kpi_code = 'OUT.1')
ON CONFLICT (project_id, indicator_code) DO NOTHING;

INSERT INTO project_mf_values (indicator_id, period_end, total, female, male, youth, notes)
SELECT i.id,
       o.survey_year::text || CASE WHEN o.quarter <= 2 THEN '-06' ELSE '-12' END,
       sum(o.farmers_trained), sum(o.female_count), sum(o.male_count), sum(o.youth_count),
       NULLIF(concat_ws('; ', 'converted from Q' || string_agg(o.quarter::text, '+' ORDER BY o.quarter),
                        string_agg(NULLIF(o.channel_notes, ''), '; ')), '')
FROM project_output_records o
JOIN project_mf_indicators i ON i.project_id = o.project_id AND i.indicator_code = 'OUT.1'
GROUP BY i.id, o.survey_year, CASE WHEN o.quarter <= 2 THEN '-06' ELSE '-12' END
ON CONFLICT (indicator_id, period_end) DO NOTHING;

-- ── Conversion 2: OUT.2 / OUT.3 / OUT.4 / OUT.6 counts ───────────────────
-- No label for these codes exists in the codebase, so they are named
-- "<code> (label to confirm)" — rename them in the Targets page editor.
INSERT INTO project_mf_indicators (project_id, indicator_code, level, indicator, annual_targets, sort_order, source)
SELECT DISTINCT r.project_id, r.output_code, 'Output', r.output_code || ' (label to confirm)',
       COALESCE((SELECT jsonb_object_agg(t.survey_year::text, jsonb_build_object('total', t.target_total))
                 FROM project_kpi_targets t WHERE t.project_id = r.project_id AND t.kpi_code = r.output_code), '{}'::jsonb),
       10 + (regexp_replace(r.output_code, '\D', '', 'g'))::int,
       'converted from project_output_kpi_records (Sprint 28)'
FROM project_output_kpi_records r
ON CONFLICT (project_id, indicator_code) DO NOTHING;

INSERT INTO project_mf_values (indicator_id, period_end, total, notes)
SELECT i.id,
       r.survey_year::text || CASE WHEN r.quarter <= 2 THEN '-06' ELSE '-12' END,
       sum(r.count),
       'converted from Q' || string_agg(r.quarter::text, '+' ORDER BY r.quarter)
FROM project_output_kpi_records r
JOIN project_mf_indicators i ON i.project_id = r.project_id AND i.indicator_code = r.output_code
GROUP BY i.id, r.survey_year, CASE WHEN r.quarter <= 2 THEN '-06' ELSE '-12' END
ON CONFLICT (indicator_id, period_end) DO NOTHING;

-- ── Progress view: latest (cumulative) or sum of periods (per-period) ────
CREATE OR REPLACE VIEW v_project_mf_progress WITH (security_invoker = true) AS
SELECT p.project_code, p.project_name, p.country, p.commodity,
       i.id AS indicator_id, i.indicator_code, i.level, i.indicator, i.unit, i.end_target, i.cumulative,
       CASE WHEN i.cumulative = false THEN (SELECT sum(v.total) FROM project_mf_values v WHERE v.indicator_id = i.id)
            ELSE (SELECT v.total FROM project_mf_values v WHERE v.indicator_id = i.id AND v.total IS NOT NULL
                  ORDER BY v.period_end DESC LIMIT 1) END AS progress,
       (SELECT max(v.period_end) FROM project_mf_values v WHERE v.indicator_id = i.id AND v.total IS NOT NULL) AS latest_period
FROM project_mf_indicators i
JOIN projects p ON p.id = i.project_id;
