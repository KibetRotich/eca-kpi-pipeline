-- =============================================================
-- MASP IV Sprint 66 — ECA Events: count farmers picked from the registry list
--
-- The ECA Events form records attendees two ways: typed in (participant repeat → eca_participants) or picked
-- from the registered-farmer list (→ eca_selected_participants, beneficiary_code). Until now the farmer counts
-- read only the typed-in rows, so 13,074 selected records (904 events, Oct 2024 – Nov 2026; most of 2026's
-- names) were left out of "Unique farmers", Farmer Depth and the New & continuing chart. Found 2026-11-05 on
-- P4G Synnefa, Oct 2026: 112 typed + 175 selected (171 farmers) vs reported reach 285.
--
-- A selected farmer's key is 'id:' || beneficiary_code — the same scheme as a typed farmer with a scanned
-- farmer_id (farmer_key 'id:<farmer_id>'), so 301 farmers recorded both ways match up and count once.
-- A farmer typed in by NAME at one event and selected at another still cannot be linked (counted twice).
--
-- eca_farmer_depth: unique_farmers / raw_records / freq now include selected farmers. ID- and phone-capture
--   (verified, with_phone) stay over typed rows only and get their own denominator typed_records, since they
--   measure how well names are typed in. The old 'monthly' new/returning output is dropped — Farmer Depth now
--   uses eca_new_continuing like the Overview.
-- eca_new_continuing (Sprint 65): same rule, now over typed + selected farmers.
-- Signatures unchanged, so existing grants are kept (service_role only).
-- =============================================================

CREATE OR REPLACE FUNCTION public.eca_farmer_depth(
  p_country text DEFAULT NULL, p_admin1 text DEFAULT NULL, p_admin2 text DEFAULT NULL,
  p_project text DEFAULT NULL, p_commodity text DEFAULT NULL, p_event_type text DEFAULT NULL,
  p_training_type text DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_include_test boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  with ev as (
    select e.submission_id
    from eca_submissions e
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
  rows as (
    select coalesce(p.farmer_key, p.id::text) as k, true as typed, p.identity_status,
           (p.phone_number is not null and btrim(p.phone_number) <> '') as has_phone
    from eca_participants p join ev on ev.submission_id = p.submission_id
    union all
    select 'id:' || s.beneficiary_code, false, null, false
    from eca_selected_participants s join ev on ev.submission_id = s.submission_id
  ),
  freq as (
    select case when c = 1 then '1' when c = 2 then '2' when c = 3 then '3'
                when c between 4 and 5 then '4-5' else '6+' end as bucket, count(*) as farmers
    from (select k, count(*) c from rows group by k) s group by 1
  )
  select jsonb_build_object(
    'raw_records',      (select count(*) from rows),
    'typed_records',    (select count(*) from rows where typed),
    'selected_records', (select count(*) from rows where not typed),
    'unique_farmers',   (select count(distinct k) from rows),
    'verified',         (select count(*) from rows where typed and identity_status = 'verified'),
    'with_phone',       (select count(*) from rows where typed and has_phone),
    'freq',             coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'farmers', farmers)) from freq), '[]'::jsonb)
  );
$$;

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
  with ev as (
    select e.submission_id, e.training_date as d, e.month
    from eca_submissions e
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
  base as (
    select coalesce(p.farmer_key, p.id::text) as k, ev.d, ev.month
    from eca_participants p join ev on ev.submission_id = p.submission_id
    union all
    select 'id:' || s.beneficiary_code, ev.d, ev.month
    from eca_selected_participants s join ev on ev.submission_id = s.submission_id
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
