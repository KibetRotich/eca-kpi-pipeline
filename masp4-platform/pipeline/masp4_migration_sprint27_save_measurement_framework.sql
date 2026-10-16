-- =============================================================
-- MASP IV Sprint 27 Migration — SAVE KE measurement framework (logframe KPIs)
-- Source: Google Sheet "SAVE Project M&E Framework"
--         (1tAW3zllJ1UYYIbMl5XTqVQhN8MBXrcFRKMm3erD1aN4, tab "dashboard_input")
-- One row per indicator x 6-monthly reporting period. Feeds tab
-- "8 · Measurement Framework" of the SAVE KE Seedlings Distribution dashboard.
-- Aggregate project figures only — no personal data.
--
-- RLS as Sprint 24/26: authenticated read only; ETL writes with the service role.
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS save_mf_indicator_values (
  indicator_id  text    NOT NULL,          -- SAVE-01 ...
  period_end    text    NOT NULL,          -- 'YYYY-MM' (Jun / Dec reporting points)
  level         text,                      -- Overall goal / Outcome / Output
  indicator     text,
  unit          text,
  baseline      numeric,
  end_target    numeric,
  cumulative    boolean,                   -- true: value is running total; false: per period; null: unconfirmed
  period_label  text,
  total         numeric,
  male          numeric,
  female        numeric,
  youth         numeric,
  survival_pct  numeric,
  note          text,
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (indicator_id, period_end)
);

ALTER TABLE save_mf_indicator_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS save_mf_indicator_values_sel ON save_mf_indicator_values;
CREATE POLICY save_mf_indicator_values_sel ON save_mf_indicator_values
  FOR SELECT TO authenticated USING (true);

-- Latest progress per indicator vs end target
-- (cumulative=false -> sum of periods; otherwise latest reported total)
CREATE OR REPLACE VIEW v_save_mf_progress WITH (security_invoker = true) AS
WITH v AS (
  SELECT *, row_number() OVER (PARTITION BY indicator_id ORDER BY period_end DESC) AS rn
  FROM save_mf_indicator_values WHERE total IS NOT NULL
)
SELECT i.indicator_id, max(i.level) AS level, max(i.indicator) AS indicator, max(i.unit) AS unit,
       max(i.end_target) AS end_target, bool_or(i.cumulative) AS cumulative,
       CASE WHEN bool_and(i.cumulative = false) THEN sum(v.total)
            ELSE max(v.total) FILTER (WHERE v.rn = 1) END AS progress,
       max(v.period_end) AS latest_period,
       round(100 * CASE WHEN bool_and(i.cumulative = false) THEN sum(v.total)
                        ELSE max(v.total) FILTER (WHERE v.rn = 1) END
             / nullif(max(i.end_target), 0), 1) AS pct_of_target
FROM save_mf_indicator_values i
LEFT JOIN v ON v.indicator_id = i.indicator_id AND v.period_end = i.period_end
GROUP BY i.indicator_id;

ALTER TABLE save_dist_sync_meta ADD COLUMN IF NOT EXISTS n_framework_rows int;
ALTER TABLE save_dist_sync_meta ADD COLUMN IF NOT EXISTS framework_synced_at timestamptz;
