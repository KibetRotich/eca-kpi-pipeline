-- =============================================================
-- MASP IV Sprint 12 Migration
-- Add REC01–REC05 Responsible Economy KPIs
-- Run once in Supabase SQL Editor
-- =============================================================

-- 1. Update kpi_code CHECK constraint to accept REC01-REC05
ALTER TABLE project_kpi_targets
  DROP CONSTRAINT IF EXISTS project_kpi_targets_kpi_code_check;

ALTER TABLE project_kpi_targets
  ADD CONSTRAINT project_kpi_targets_kpi_code_check
  CHECK (kpi_code IN (
    'S6.1','S6.2','S2.1','S2.5','S6.3','S6.4','S6.5','OUT.1',
    'REC01','REC02','REC03','REC04','REC05'
  ));

-- 2. Create table for manually-entered REC KPI annual actuals
CREATE TABLE IF NOT EXISTS project_rec_records (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  survey_year int         NOT NULL,
  rec_code    text        NOT NULL CHECK (rec_code IN ('REC01','REC02','REC03','REC04','REC05')),
  count       int         NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (project_id, survey_year, rec_code)
);

-- 3. RLS
ALTER TABLE project_rec_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_select_all"   ON project_rec_records FOR SELECT USING (true);
CREATE POLICY "rec_insert_auth"  ON project_rec_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "rec_update_auth"  ON project_rec_records FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "rec_delete_auth"  ON project_rec_records FOR DELETE USING (auth.uid() IS NOT NULL);

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'project_rec_records' ORDER BY ordinal_position;
