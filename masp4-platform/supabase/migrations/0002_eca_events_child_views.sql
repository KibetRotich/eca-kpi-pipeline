-- ============================================================================
-- ECA Events — filterable, PII-free child views.
--
-- The exploded child tables are RLS-locked; expose them to the dashboard as
-- views that JOIN to eca_submissions so each child row inherits the SAME filter
-- dimensions as an event (country/admin/project/commodity/event-type/training-
-- type/date/is_real). No data duplicated — dimensions are resolved on read.
-- The query layer then applies one identical filter predicate everywhere.
--
-- Re-runnable. Apply after 0001.
-- ============================================================================

-- Shared event dimension columns, aliased from the parent submission.
--   e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
--   e.project_commodity_category_label, e.event_type_label, e.training_type_label,
--   e.is_real, e.is_test, e.training_date, e.month, e.year

create or replace view public.v_eca_topics_safe as
  select t.submission_id, t.code, t.label,
         e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
         e.project_commodity_category_label, e.event_type_label, e.training_type_label,
         e.is_real, e.is_test, e.training_date, e.month, e.year
  from public.eca_training_topics t
  join public.eca_submissions e on e.submission_id = t.submission_id;

create or replace view public.v_eca_beneficiaries_safe as
  select b.submission_id, b.code, b.label,
         e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
         e.project_commodity_category_label, e.event_type_label, e.training_type_label,
         e.is_real, e.is_test, e.training_date, e.month, e.year
  from public.eca_beneficiary_types b
  join public.eca_submissions e on e.submission_id = b.submission_id;

create or replace view public.v_eca_modules_safe as
  select m.submission_id, m.code, m.label,
         e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
         e.project_commodity_category_label, e.event_type_label, e.training_type_label,
         e.is_real, e.is_test, e.training_date, e.month, e.year
  from public.eca_training_modules m
  join public.eca_submissions e on e.submission_id = m.submission_id;

-- Rebuild participants/facilitators safe views WITH the full event dimensions
-- (column set changes → drop then recreate). Still PII-free.
drop view if exists public.v_eca_participants_safe;
create view public.v_eca_participants_safe as
  select p.submission_id, p.participant_index,
         p.gender_label, p.age_group_label, p.is_youth, p.identity_status,
         (p.phone_number is not null and btrim(p.phone_number) <> '') as has_phone,
         md5(coalesce(p.farmer_key, p.id::text)) as farmer_hash,
         e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
         e.project_commodity_category_label, e.event_type_label, e.training_type_label,
         e.is_real, e.is_test, e.training_date, e.month, e.year
  from public.eca_participants p
  join public.eca_submissions e on e.submission_id = p.submission_id;

drop view if exists public.v_eca_facilitators_safe;
create view public.v_eca_facilitators_safe as
  select f.submission_id, f.facilitator_index, f.facilitator_type, f.facilitator_type_label,
         f.organization,
         e.country_label, e.admin_level_1_label, e.admin_level_2, e.project_label,
         e.project_commodity_category_label, e.event_type_label, e.training_type_label,
         e.is_real, e.is_test, e.training_date, e.month, e.year
  from public.eca_facilitators f
  join public.eca_submissions e on e.submission_id = f.submission_id;

grant select on
  public.v_eca_topics_safe,
  public.v_eca_beneficiaries_safe,
  public.v_eca_modules_safe,
  public.v_eca_participants_safe,
  public.v_eca_facilitators_safe
to anon, authenticated;

-- ── Farmer-depth RPC ──────────────────────────────────────────────────────────
-- Server-side, filterable aggregation over the 60k+ participant rows (too large
-- to page to the client each load). Returns PII-free aggregates only:
--   headline (raw records, unique deduped farmers, verified/with-phone counts),
--   monthly new-vs-returning, and session-frequency buckets.
-- SECURITY DEFINER so it can read the RLS-locked base tables; returns no PII.
create or replace function public.eca_farmer_depth(
  p_country text default null, p_admin1 text default null, p_admin2 text default null,
  p_project text default null, p_commodity text default null,
  p_event_type text default null, p_training_type text default null,
  p_from date default null, p_to date default null, p_include_test boolean default false
) returns jsonb
language sql stable security definer set search_path = public as $$
  with rows as (
    select md5(coalesce(p.farmer_key, p.id::text)) as hash,
           p.identity_status,
           (p.phone_number is not null and btrim(p.phone_number) <> '') as has_phone,
           e.month, e.training_date
    from eca_participants p
    join eca_submissions e on e.submission_id = p.submission_id
    where (p_include_test or e.is_real)
      and (p_country       is null or e.country_label = p_country)
      and (p_admin1        is null or e.admin_level_1_label = p_admin1)
      and (p_admin2        is null or e.admin_level_2 = p_admin2)
      and (p_project       is null or e.project_label = p_project)
      and (p_commodity     is null or e.project_commodity_category_label = p_commodity)
      and (p_event_type    is null or e.event_type_label = p_event_type)
      and (p_training_type is null or e.training_type_label = p_training_type)
      and (p_from is null or e.training_date >= p_from)
      and (p_to   is null or e.training_date <= p_to)
  ),
  first_seen as (
    select hash, min(training_date) as first_date, min(month) as first_month from rows group by hash
  ),
  monthly as (
    select r.month,
           count(*) filter (where r.month = f.first_month) as new_farmers,
           count(*) filter (where r.month <> f.first_month) as returning_records
    from rows r join first_seen f on f.hash = r.hash
    where r.month is not null group by r.month order by r.month
  ),
  freq as (
    select case when c = 1 then '1' when c = 2 then '2' when c = 3 then '3'
                when c between 4 and 5 then '4-5' else '6+' end as bucket, count(*) as farmers
    from (select hash, count(*) c from rows group by hash) s group by 1
  )
  select jsonb_build_object(
    'raw_records',    (select count(*) from rows),
    'unique_farmers', (select count(distinct hash) from rows),
    'verified',       (select count(*) from rows where identity_status = 'verified'),
    'with_phone',     (select count(*) from rows where has_phone),
    'monthly',        coalesce((select jsonb_agg(jsonb_build_object('month',month,'new',new_farmers,'returning',returning_records) order by month) from monthly), '[]'::jsonb),
    'freq',           coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket,'farmers',farmers)) from freq), '[]'::jsonb)
  );
$$;

grant execute on function public.eca_farmer_depth to anon, authenticated;
