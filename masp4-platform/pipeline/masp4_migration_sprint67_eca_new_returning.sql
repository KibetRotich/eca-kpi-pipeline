-- =============================================================
-- MASP IV Sprint 67 — ECA Events: new & returning farmers by month (replaces Sprint 65/66 eca_new_continuing)
--
-- User, 2026-11-05: drop the MASP year-based new/continuing split and show new vs returning. The year rule
-- showed P4G Synnefa (all events in 2026) as 100% new even though 52% of its farmer-months were repeat
-- attendance.
--   new       = the farmer's first-ever recorded training is in that month
--   returning = the farmer was trained in an earlier month
-- Distinct farmers per month, typed in + picked from the registry list (keyed as in Sprint 66). First month
-- is taken over ALL dates under the other filters, so the Month filter narrows the bars without turning
-- everyone into "new".
--
-- Run section 1, deploy the platform (it calls eca_new_returning), then section 2.
-- =============================================================

-- 1 ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eca_new_returning(
  p_country text DEFAULT NULL, p_admin1 text DEFAULT NULL, p_admin2 text DEFAULT NULL,
  p_project text DEFAULT NULL, p_commodity text DEFAULT NULL, p_event_type text DEFAULT NULL,
  p_training_type text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  with ev as (
    select e.submission_id, e.training_date as d, e.month
    from eca_submissions e
    where (p_include_test or e.is_real)
      and e.training_date is not null and e.month is not null
      and (p_country       is null or e.country_label = p_country)
      and (p_admin1        is null or e.admin_level_1_label = p_admin1)
      and (p_admin2        is null or e.admin_level_2 = p_admin2)
      and (p_project       is null or e.project_label = p_project)
      and (p_commodity     is null or e.project_commodity_category_label = p_commodity)
      and (p_event_type    is null or e.event_type_label = p_event_type)
      and (p_training_type is null or e.training_type_label = p_training_type)
  ),
  base as (
    select coalesce(p.farmer_key, p.id::text) as k, ev.d, ev.month
    from eca_participants p join ev on ev.submission_id = p.submission_id
    union all
    select 'id:' || s.beneficiary_code, ev.d, ev.month
    from eca_selected_participants s join ev on ev.submission_id = s.submission_id
  ),
  first_month as (
    select k, min(month) as fm from base group by k
  ),
  per_month as (
    select distinct b.month, b.k
    from base b
    where (p_from is null or b.d >= p_from)
      and (p_to   is null or b.d <= p_to)
  ),
  monthly as (
    select m.month,
           count(*) filter (where f.fm =  m.month) as new_farmers,
           count(*) filter (where f.fm <  m.month) as returning_farmers
    from per_month m join first_month f on f.k = m.k
    group by m.month
  )
  select coalesce(jsonb_agg(jsonb_build_object('month', month, 'new', new_farmers, 'returning', returning_farmers)
                            order by month), '[]'::jsonb)
  from monthly;
$$;

REVOKE ALL ON FUNCTION public.eca_new_returning(text, text, text, text, text, text, text, date, date, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eca_new_returning(text, text, text, text, text, text, text, date, date, boolean)
  TO service_role;

-- 2 ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.eca_new_continuing(text, text, text, text, text, text, text, date, date, boolean);
