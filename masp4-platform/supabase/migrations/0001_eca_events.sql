-- ============================================================================
-- ECA Trainings & Events Tracker — analytics schema
-- Form: aCt5s6EGUnE7UxJVeuXjpY ("ECA Trainings and Events Tracker")
--
-- Populated by pipeline/eca-events/sync_supabase.py (idempotent, keyed on
-- submission_id). Base tables hold PII and are locked by RLS to the service
-- role; the dashboard reads only the PII-free `v_eca_*_safe` and KPI views,
-- which are granted to anon/authenticated.
--
-- Re-runnable: IF NOT EXISTS / CREATE OR REPLACE throughout.
-- ============================================================================

-- ── Base tables ─────────────────────────────────────────────────────────────

-- One row per submission (an event). Scalar + derived fields from enrich_events.
create table if not exists public.eca_submissions (
  submission_id            bigint primary key,          -- Kobo _id
  submission_uuid          text,
  form_version             text,
  -- when / lag
  training_date            date,
  next_training_date       date,
  submission_time          timestamptz,
  submission_lag_days      integer,
  month                    text,                         -- 'YYYY-MM'
  year                     integer,
  -- where
  country                  text,
  country_label            text,
  admin_level_1            text,
  admin_level_1_label      text,
  admin_level_1_title      text,                         -- resolved, country-conditional
  admin_level_2            text,
  admin_level_2_label      text,
  admin_level_2_title      text,
  admin_level_3            text,
  admin_level_3_label      text,
  admin_level_3_title      text,
  training_location        text,
  lat                      double precision,
  lon                      double precision,
  altitude                 double precision,
  gps_accuracy             double precision,
  -- who / what
  project                  text,
  project_label            text,
  project_commodity_category        text,
  project_commodity_category_label  text,
  project_commodity_specific        text,
  project_commodity_specific_label  text,
  is_organization_activity text,
  organization_name        text,
  training_title           text,
  training_topic_raw       text,                         -- space-delimited codes
  event_type               text,
  event_type_label         text,
  training_type            text,
  training_type_label      text,
  is_training_manual_used  text,
  is_training_manual_used_label text,
  manual_name              text,
  -- reach (aggregate headcounts — NOT individually-recorded counts)
  total_participants       numeric,
  female_participants      numeric,
  male_youth_participants  numeric,
  female_youth_participants numeric,
  youth_participants       numeric,
  pct_female               numeric,
  pct_youth                numeric,
  -- individual-record capture
  n_participants_recorded  integer,
  n_selected_participants  integer,
  n_individual_records     integer,
  individual_capture_rate  numeric,
  -- repeat-group counts + completeness
  n_facilitators           integer,
  n_photos                 integer,
  n_sheet_pages            integer,
  has_gps                  boolean,
  has_photo                boolean,
  has_attendance_sheet     boolean,
  completeness_score       numeric,
  missing_gps              boolean,
  missing_photo            boolean,
  missing_sheet            boolean,
  missing_admin2           boolean,
  -- test/real
  real_test                text,
  is_test                  boolean,
  is_real                  boolean,
  -- PII (restricted): enumerator name shown only in aggregate downstream
  enumarator_names         text,
  synced_at                timestamptz not null default now()
);
create index if not exists idx_eca_sub_real     on public.eca_submissions (is_real);
create index if not exists idx_eca_sub_country  on public.eca_submissions (country_label);
create index if not exists idx_eca_sub_project  on public.eca_submissions (project_label);
create index if not exists idx_eca_sub_month    on public.eca_submissions (month);
create index if not exists idx_eca_sub_date     on public.eca_submissions (training_date);

-- One row per participant[] repeat item. Holds row-level PII.
create table if not exists public.eca_participants (
  id                bigserial primary key,
  submission_id     bigint not null references public.eca_submissions(submission_id) on delete cascade,
  participant_index integer,
  gender            text,
  gender_label      text,
  age_group         text,
  age_group_label   text,
  disability        text,          -- aggregate-only downstream
  disability_label  text,
  is_youth          boolean,
  identity_status   text,          -- 'verified' | 'unverified'
  farmer_key        text,          -- dedup key (may embed name/phone -> PII)
  has_farmer_id     text,
  farmer_id         text,          -- PII
  first_name        text,          -- PII
  last_name         text,          -- PII
  phone_number      text,          -- PII
  year_of_birth     text,
  country_label     text,
  project_label     text,
  event_type_label  text,
  training_date     date,
  month             text,
  year              integer
);
create index if not exists idx_eca_part_sub on public.eca_participants (submission_id);

-- One row per facilitator[] repeat item.
create table if not exists public.eca_facilitators (
  id                 bigserial primary key,
  submission_id      bigint not null references public.eca_submissions(submission_id) on delete cascade,
  facilitator_index  integer,
  facilitator_type   text,
  facilitator_type_label text,
  facilitator_names  text,         -- PII
  organization       text,
  country_label      text,
  project_label      text,
  training_date      date,
  month              text,
  year               integer,
  is_real            boolean
);
create index if not exists idx_eca_fac_sub on public.eca_facilitators (submission_id);

-- Exploded multi-selects (long format), one table each.
create table if not exists public.eca_beneficiary_types (
  id            bigserial primary key,
  submission_id bigint not null references public.eca_submissions(submission_id) on delete cascade,
  code          text,
  label         text,
  country_label text, project_label text, is_real boolean, is_test boolean,
  training_date date, month text, year integer
);
create index if not exists idx_eca_bt_sub on public.eca_beneficiary_types (submission_id);

create table if not exists public.eca_training_topics (
  id            bigserial primary key,
  submission_id bigint not null references public.eca_submissions(submission_id) on delete cascade,
  code          text,
  label         text,
  country_label text, project_label text, is_real boolean, is_test boolean,
  training_date date, month text, year integer
);
create index if not exists idx_eca_tt_sub on public.eca_training_topics (submission_id);

create table if not exists public.eca_training_modules (
  id            bigserial primary key,
  submission_id bigint not null references public.eca_submissions(submission_id) on delete cascade,
  code          text,
  label         text,
  country_label text, project_label text, is_real boolean, is_test boolean,
  training_date date, month text, year integer
);
create index if not exists idx_eca_tm_sub on public.eca_training_modules (submission_id);

-- Known-farmer-list selections (id__code tokens).
create table if not exists public.eca_selected_participants (
  id               bigserial primary key,
  submission_id    bigint not null references public.eca_submissions(submission_id) on delete cascade,
  internal_id      text,           -- PII-adjacent
  beneficiary_code text,
  country_label    text,
  project_label    text,
  is_real          boolean,
  training_date    date
);
create index if not exists idx_eca_sel_sub on public.eca_selected_participants (submission_id);

-- Single-row refresh metadata for the "last data refresh" banner.
create table if not exists public.eca_sync_meta (
  id                  smallint primary key default 1,
  refreshed_at        timestamptz,
  source              text,          -- 'mcp' | 'httpx' (REST) | 'cache' | 'synthetic'
  submission_count    integer,
  event_count         integer,
  real_count          integer,
  test_count          integer,
  choices_provisional boolean,
  constraint eca_sync_meta_singleton check (id = 1)
);

-- ── PII-free "safe" views (dashboard reads these) ────────────────────────────

create or replace view public.v_eca_events_safe as
  select submission_id, submission_uuid, form_version,
         training_date, next_training_date, submission_time, submission_lag_days,
         month, year,
         country, country_label,
         admin_level_1, admin_level_1_label, admin_level_1_title,
         admin_level_2, admin_level_2_label, admin_level_2_title,
         admin_level_3, admin_level_3_label, admin_level_3_title,
         training_location, lat, lon, altitude, gps_accuracy,
         project, project_label,
         project_commodity_category, project_commodity_category_label,
         project_commodity_specific, project_commodity_specific_label,
         is_organization_activity, organization_name,
         training_title, training_topic_raw,
         event_type, event_type_label, training_type, training_type_label,
         is_training_manual_used, is_training_manual_used_label, manual_name,
         total_participants, female_participants, male_youth_participants,
         female_youth_participants, youth_participants, pct_female, pct_youth,
         n_participants_recorded, n_selected_participants, n_individual_records,
         individual_capture_rate, n_facilitators, n_photos, n_sheet_pages,
         has_gps, has_photo, has_attendance_sheet, completeness_score,
         missing_gps, missing_photo, missing_sheet, missing_admin2,
         real_test, is_test, is_real
         -- enumarator_names intentionally omitted (PII)
  from public.eca_submissions;

-- Participants without names/phone/id; farmer identity exposed only as a hash
-- (stable for dedup counting) + verification flag. Disability omitted at row
-- level (aggregate-only, see v_eca_disability_summary).
create or replace view public.v_eca_participants_safe as
  select submission_id, participant_index,
         gender_label, age_group_label, is_youth, identity_status,
         md5(coalesce(farmer_key, id::text)) as farmer_hash,
         country_label, project_label, event_type_label, training_date, month, year
  from public.eca_participants;

create or replace view public.v_eca_facilitators_safe as
  select submission_id, facilitator_index, facilitator_type, facilitator_type_label,
         organization, country_label, project_label, training_date, month, year, is_real
  from public.eca_facilitators;  -- facilitator_names omitted (PII)

-- ── KPI / pre-aggregated views (real records only) ──────────────────────────

create or replace view public.v_eca_kpi_overview as
  select
    count(*)                                                    as total_events,
    coalesce(sum(total_participants), 0)                        as total_reach,
    coalesce(sum(female_participants), 0)                       as total_female,
    coalesce(sum(youth_participants), 0)                        as total_youth,
    case when sum(total_participants) > 0
         then round(100.0 * sum(female_participants) / sum(total_participants), 1) end as pct_female,
    case when sum(total_participants) > 0
         then round(100.0 * sum(youth_participants)  / sum(total_participants), 1) end as pct_youth,
    count(distinct country_label)                               as active_countries,
    count(distinct project_label)                               as active_projects,
    min(training_date)                                          as first_event,
    max(training_date)                                          as last_event
  from public.eca_submissions where is_real;

create or replace view public.v_eca_events_by_month as
  select month, year,
         count(*)                              as events,
         coalesce(sum(total_participants),0)   as reach,
         coalesce(sum(female_participants),0)  as female,
         coalesce(sum(youth_participants),0)   as youth
  from public.eca_submissions where is_real and month is not null
  group by month, year order by month;

create or replace view public.v_eca_reach_by_country as
  select country_label,
         count(*)                              as events,
         coalesce(sum(total_participants),0)   as reach,
         case when sum(total_participants) > 0
              then round(100.0*sum(female_participants)/sum(total_participants),1) end as pct_female,
         case when sum(total_participants) > 0
              then round(100.0*sum(youth_participants)/sum(total_participants),1) end as pct_youth
  from public.eca_submissions where is_real
  group by country_label order by reach desc;

create or replace view public.v_eca_project_league as
  select project_label,
         count(*)                              as events,
         coalesce(sum(total_participants),0)   as reach,
         count(distinct country_label)         as countries,
         case when sum(total_participants) > 0
              then round(100.0*sum(female_participants)/sum(total_participants),1) end as pct_female,
         case when sum(total_participants) > 0
              then round(100.0*sum(youth_participants)/sum(total_participants),1) end as pct_youth
  from public.eca_submissions where is_real
  group by project_label order by reach desc;

create or replace view public.v_eca_topic_counts as
  select label as topic, count(*) as events
  from public.eca_training_topics where is_real and label <> ''
  group by label order by events desc;

create or replace view public.v_eca_beneficiary_counts as
  select label as beneficiary_type, count(*) as events
  from public.eca_beneficiary_types where is_real and label <> ''
  group by label order by events desc;

create or replace view public.v_eca_module_counts as
  select label as module, count(*) as events
  from public.eca_training_modules where is_real and label <> ''
  group by label order by events desc;

create or replace view public.v_eca_facilitator_mix as
  select facilitator_type_label as facilitator_type, count(*) as n
  from public.eca_facilitators where is_real and facilitator_type_label <> ''
  group by facilitator_type_label order by n desc;

-- Disability shown ONLY in aggregate (never row-level).
create or replace view public.v_eca_disability_summary as
  select coalesce(nullif(disability_label,''),'Unknown') as disability_status,
         count(*) as participants
  from public.eca_participants
  group by 1 order by participants desc;

-- Gender x event type cross-tab (event counts).
create or replace view public.v_eca_gender_by_event_type as
  select coalesce(nullif(event_type_label,''),'Unspecified') as event_type,
         coalesce(sum(female_participants),0) as female,
         coalesce(sum(total_participants),0) - coalesce(sum(female_participants),0) as male_or_other,
         coalesce(sum(total_participants),0) as total
  from public.eca_submissions where is_real
  group by 1 order by total desc;

-- Data-quality: enumerator submission counts + mean completeness (name is an
-- aggregate grouping key here, per the enumerator-level DQ requirement).
create or replace view public.v_eca_enumerator_quality as
  select coalesce(nullif(enumarator_names,''),'(unnamed)') as enumerator,
         count(*)                    as submissions,
         round(avg(completeness_score),1) as avg_completeness,
         sum((is_test)::int)         as test_records
  from public.eca_submissions
  group by 1 order by submissions desc;

-- Farmer depth: unique (deduped) vs raw individual records.
create or replace view public.v_eca_farmer_depth as
  select count(*)                                as raw_individual_records,
         count(distinct md5(coalesce(farmer_key, id::text))) as unique_farmers,
         sum((identity_status = 'verified')::int) as verified_records
  from public.eca_participants;

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Lock every base table: with RLS on and no policy, only the service role
-- (which bypasses RLS) can read/write. The dashboard uses the anon key and can
-- only reach the granted PII-free views below.
alter table public.eca_submissions          enable row level security;
alter table public.eca_participants          enable row level security;
alter table public.eca_facilitators          enable row level security;
alter table public.eca_beneficiary_types     enable row level security;
alter table public.eca_training_topics       enable row level security;
alter table public.eca_training_modules      enable row level security;
alter table public.eca_selected_participants enable row level security;
alter table public.eca_sync_meta             enable row level security;

-- Expose the safe/KPI views (and only those) to the public/authenticated roles.
grant usage on schema public to anon, authenticated;
grant select on
  public.v_eca_events_safe,
  public.v_eca_participants_safe,
  public.v_eca_facilitators_safe,
  public.v_eca_kpi_overview,
  public.v_eca_events_by_month,
  public.v_eca_reach_by_country,
  public.v_eca_project_league,
  public.v_eca_topic_counts,
  public.v_eca_beneficiary_counts,
  public.v_eca_module_counts,
  public.v_eca_facilitator_mix,
  public.v_eca_disability_summary,
  public.v_eca_gender_by_event_type,
  public.v_eca_enumerator_quality,
  public.v_eca_farmer_depth
to anon, authenticated;

-- sync_meta: allow read of the single refresh-status row to the dashboard.
drop policy if exists eca_sync_meta_read on public.eca_sync_meta;
create policy eca_sync_meta_read on public.eca_sync_meta
  for select to anon, authenticated using (true);
