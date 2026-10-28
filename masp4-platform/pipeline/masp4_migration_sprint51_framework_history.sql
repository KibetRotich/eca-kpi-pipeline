-- =============================================================
-- MASP IV Sprint 51 — change history for the project measurement frameworks
-- The nightly sync (pipeline/frameworks/sync_framework_sheets.py) overwrites project_mf_sheet_values
-- with whatever is in each Google Sheet, and the sheets are editable by many people. This keeps an
-- audit trail: every insert, real change and delete of a framework row, whoever made it (sync, SQL
-- editor, loader script), with old and new values — so a reported figure or target can be traced
-- and rolled back.
--
-- * project_mf_sheet_values_history: one row per change. `changed` = {column: [old, new]} for
--   updates (updated_at alone is ignored, so the nightly re-stamp of unchanged rows logs nothing);
--   `row_data` = the full row (new row for insert/update, old row for delete).
-- * source: SET LOCAL app.change_source = '...' in SQL, or the x-change-source request header (the
--   sync sends 'framework-sync'); otherwise the caller's email / JWT role, else the session user.
-- * v_project_mf_target_changes: target edits only (end_target / target_direct / target_period),
--   newest first, for M&E review.
-- Staff can read; nobody writes directly (the trigger is SECURITY DEFINER). Re-runnable.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.project_mf_sheet_values_history (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    uuid        NOT NULL,
  indicator_id  text        NOT NULL,
  period_end    text        NOT NULL,
  op            text        NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  changed       jsonb,
  row_data      jsonb       NOT NULL,
  source        text,
  changed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_mf_sheet_values_history_key
  ON public.project_mf_sheet_values_history (project_id, indicator_id, period_end, changed_at DESC);
CREATE INDEX IF NOT EXISTS project_mf_sheet_values_history_at
  ON public.project_mf_sheet_values_history (changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_project_mf_sheet_values_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  diff jsonb;
  hdrs   jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  -- current_user is the function owner here (SECURITY DEFINER), so name the caller from the request
  src  text := coalesce(
    nullif(current_setting('app.change_source', true), ''),
    nullif(hdrs ->> 'x-change-source', ''),
    claims ->> 'email',
    claims ->> 'role',
    session_user);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO project_mf_sheet_values_history (project_id, indicator_id, period_end, op, row_data, source)
    VALUES (NEW.project_id, NEW.indicator_id, NEW.period_end, 'insert', to_jsonb(NEW), src);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO project_mf_sheet_values_history (project_id, indicator_id, period_end, op, row_data, source)
    VALUES (OLD.project_id, OLD.indicator_id, OLD.period_end, 'delete', to_jsonb(OLD), src);
    RETURN OLD;
  END IF;

  SELECT jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value))
    INTO diff
  FROM jsonb_each(to_jsonb(NEW)) n
  JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
  WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM o.value;

  IF diff IS NOT NULL THEN
    INSERT INTO project_mf_sheet_values_history (project_id, indicator_id, period_end, op, changed, row_data, source)
    VALUES (NEW.project_id, NEW.indicator_id, NEW.period_end, 'update', diff, to_jsonb(NEW), src);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_project_mf_sheet_values_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_mf_sheet_values_history_trg ON public.project_mf_sheet_values;
CREATE TRIGGER project_mf_sheet_values_history_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.project_mf_sheet_values
  FOR EACH ROW EXECUTE FUNCTION public.log_project_mf_sheet_values_change();

ALTER TABLE public.project_mf_sheet_values_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_mf_sheet_values_history_sel ON public.project_mf_sheet_values_history;
CREATE POLICY project_mf_sheet_values_history_sel ON public.project_mf_sheet_values_history
  FOR SELECT TO authenticated USING (public.is_staff());
REVOKE ALL ON public.project_mf_sheet_values_history FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_mf_sheet_values_history FROM authenticated;

-- Target edits for M&E review
CREATE OR REPLACE VIEW public.v_project_mf_target_changes
WITH (security_invoker = true) AS
SELECT h.changed_at, p.project_code, h.indicator_id, h.period_end, h.row_data ->> 'indicator' AS indicator,
       k.key AS field, h.changed -> k.key ->> 0 AS old_value, h.changed -> k.key ->> 1 AS new_value, h.source
FROM public.project_mf_sheet_values_history h
JOIN public.projects p ON p.id = h.project_id
CROSS JOIN LATERAL jsonb_object_keys(h.changed) AS k(key)
WHERE h.op = 'update' AND k.key IN ('end_target', 'target_direct', 'target_period')
ORDER BY h.changed_at DESC;
REVOKE ALL ON public.v_project_mf_target_changes FROM anon;
GRANT SELECT ON public.v_project_mf_target_changes TO authenticated;

-- Baseline: one 'insert' snapshot of every current row, so the first real change has a "before"
INSERT INTO public.project_mf_sheet_values_history (project_id, indicator_id, period_end, op, row_data, source, changed_at)
SELECT v.project_id, v.indicator_id, v.period_end, 'insert', to_jsonb(v), 'sprint51 baseline', now()
FROM public.project_mf_sheet_values v
WHERE NOT EXISTS (SELECT 1 FROM public.project_mf_sheet_values_history LIMIT 1);
