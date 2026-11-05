-- =============================================================
-- MASP IV Sprint 65 — ECA Events: new & continuing farmers by month
--
-- Feeds the "New & continuing farmers" chart on the /eca-events Overview (replaced "Reach & events by month").
-- The Kobo form (aCt5s6EGUnE7UxJVeuXjpY) has no new/continuing question, so the status follows the MASP
-- results_new / results_continued convention, year-based (user, 2026-11-05):
--   new        = the farmer's first recorded training is in that calendar year
--   continuing = the farmer was first recorded in an earlier year
-- Each month counts DISTINCT farmers who attended that month (a farmer in several months appears in each).
-- A farmer = eca_participants.farmer_key (farmer ID when captured, else normalised name).
--
-- First-year is worked out over ALL dates under the other filters (country, project, …), so the month
-- filter narrows the bars without turning everyone into "new". p_from / p_to only limit which months show.
--
-- SECURITY INVOKER + execute for service_role only: the platform reads it server-side via supabaseAdmin
-- (Sprint 50 / 59 — no anon or authenticated access to farmer-level tables).
-- =============================================================

CREATE OR REPLACE FUNCTION public.eca_new_continuing(
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
  with base as (
    select coalesce(p.farmer_key, p.id::text) as k, e.training_date as d, e.month
    from eca_participants p
    join eca_submissions e on e.submission_id = p.submission_id
    where (p_include_test or e.is_real)
      and e.training_date is not null
      and (p_country       is null or e.country_label = p_country)
      and (p_admin1        is null or e.admin_level_1_label = p_admin1)
      and (p_admin2        is null or e.admin_level_2 = p_admin2)
      and (p_project       is null or e.project_label = p_project)
      and (p_commodity     is null or e.project_commodity_category_label = p_commodity)
      and (p_event_type    is null or e.event_type_label = p_event_type)
      and (p_training_type is null or e.training_type_label = p_training_type)
  ),
  first_year as (
    select k, min(extract(year from d))::int as fy from base group by k
  ),
  per_month as (
    select b.month, b.k, extract(year from min(b.d))::int as y
    from base b
    where b.month is not null
      and (p_from is null or b.d >= p_from)
      and (p_to   is null or b.d <= p_to)
    group by b.month, b.k
  ),
  monthly as (
    select m.month,
           count(*) filter (where f.fy =  m.y) as new_farmers,
           count(*) filter (where f.fy <  m.y) as continuing_farmers
    from per_month m join first_year f on f.k = m.k
    group by m.month
  )
  select coalesce(jsonb_agg(jsonb_build_object('month', month, 'new', new_farmers, 'continuing', continuing_farmers)
                            order by month), '[]'::jsonb)
  from monthly;
$$;

REVOKE ALL ON FUNCTION public.eca_new_continuing(text, text, text, text, text, text, text, date, date, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eca_new_continuing(text, text, text, text, text, text, text, date, date, boolean)
  TO service_role;
