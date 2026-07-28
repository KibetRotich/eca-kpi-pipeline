-- =====================================================================
-- Sprint 23 - Cool Farm Profile (CFP) crop-assessment analytics store
-- Source: KoBoToolbox form a4AC6PCXs4QFs3KBym8KKS
--         "ECA CFP Crops Assessments v25.04.25"
-- Target: MASPIV_Platform (qzvkhocrmpvegmawrlkg)
--
-- Follows the house pattern established by Sprints 18-21
-- (hcs_/cva_/vsla_): <prefix>_raw_submissions + <prefix>_sync_meta +
-- domain tables + v_<prefix>_* views.
--
-- SCOPE DECISION (approved 2026-07-28): practice-adoption + derived
-- intensity metrics. NO CO2e computation -- the form carries no emission
-- factors and the energy/irrigation/N inputs are too sparse to support a
-- defensible footprint. Derived intensities (kg N/ha, tonne-km, t/ha,
-- burn share, shade cover) are stored so a future Cool Farm calculation
-- layer can consume them without rework.
--
-- PII DECISION (approved): farmer names, phone numbers and Kobo's
-- meta/instanceName are NEVER loaded. Precise GPS IS stored (geospatial
-- analytics were requested) but every view requires authentication --
-- see the RLS note at the bottom, which deliberately DIVERGES from the
-- anon-readable policy used by cva_/vsla_.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Raw landing zone (matches cva_/vsla_raw_submissions shape exactly)
-- ---------------------------------------------------------------------
create table if not exists cfp_raw_submissions (
  id           uuid primary key default gen_random_uuid(),
  form_uid     text        not null,
  kobo_id      bigint      not null unique,
  submitted_at timestamptz,
  raw          jsonb       not null,
  fetched_at   timestamptz not null default now()
);
comment on table cfp_raw_submissions is
  'Verbatim Kobo submission JSON incl. nested repeat groups. Replay source for reprocessing without re-hitting Kobo. Contains PII -- never expose.';

create index if not exists cfp_raw_submitted_at_idx on cfp_raw_submissions (submitted_at desc);

-- ---------------------------------------------------------------------
-- 1. Parent: one row per assessed farm/crop
-- ---------------------------------------------------------------------
create table if not exists cfp_submissions (
  submission_id           uuid primary key default gen_random_uuid(),
  kobo_id                 bigint      not null unique,
  kobo_uuid               text,
  form_version            text,
  submitted_at            timestamptz,
  submission_month        date,                 -- date_trunc('month') for the activity tile

  -- ---- geography -------------------------------------------------
  country                 text,                 -- single value 'uganda' in current data
  region                  text,                 -- admin_level_1  (7 values)
  district                text,                 -- admin_level_2  (27 values)
  subcounty_raw           text,                 -- admin_level_3  (FREE TEXT - dirty, do not filter)
  village_raw             text,                 -- free text; retained for DQ/completeness only
  latitude                numeric(10,7),
  longitude               numeric(10,7),
  gps_altitude_m          numeric,
  gps_precision_m         numeric,

  -- ---- programme -------------------------------------------------
  project                 text,                 -- 3 values; primary filter
  enumerator              text,                 -- trimmed + lowercased-title-cased in ETL

  -- ---- farmer (NO names, NO phone -- see PII decision) ----------
  birth_year              int,
  age_years               int,                  -- derived: assessment_year - birth_year
  age_band                text,                 -- '<25','25-34','35-44','45-54','55-64','65+'
  is_youth                boolean,              -- age < 35
  gender                  text,
  literacy_level          text,
  literacy_is_primary_or_less boolean,
  household_size          int,
  disability              boolean,
  disability_form         text,
  access_to_mobile_device boolean,
  mobile_device_type      text,
  access_to_internet      boolean,
  language                text,
  cooperative_member      boolean,
  cooperative_name_raw    text,

  -- ---- crop / farm ----------------------------------------------
  crop_type               text,                 -- cleaned ('cocoa_monocrop' -> 'cocoa monocrop')
  crop_species            text,                 -- derived: 'coffee' | 'cocoa'
  crop_system             text,                 -- derived: 'shaded' | 'monocrop'
  is_shaded               boolean,
  soil_type               text,
  expected_lifecycle_years int,
  assessment_year         int,
  crop_age                int,
  crop_age_band           text,
  growing_area_raw        numeric,
  growing_area_uom        text,
  area_ha                 numeric,              -- NORMALISED (acres x 0.404686)
  dead_plants_perc        numeric,
  dead_plants_replaced    boolean,
  plants_per_area_raw     int,
  plants_per_area_uom     text,
  plants_per_ha           numeric,              -- NORMALISED

  -- ---- production ------------------------------------------------
  total_yield_t           numeric,              -- the ONLY real production figure
  yield_t_per_ha          numeric,              -- DERIVED INTENSITY
  waste_fruit_perc        numeric,

  -- ---- pruning (year-by-year branch unused: 100% constant_value) --
  pruning_option          text,
  pruning_constant_val    numeric,
  pruning_start_year_raw  int,
  pruning_start_year_offset int,                -- cleaned: >1900 reinterpreted as calendar

  -- ---- adoption gate flags --------------------------------------
  pesticide_applied       boolean,
  fertilizer_applied      boolean,
  fuel_energy_used        boolean,
  irrigation_used         boolean,
  wastewater_treated      boolean,
  intercrop_exists        boolean,
  shade_trees_exist       boolean,
  hedges_exist            boolean,
  land_use_change_exists  boolean,

  -- ---- forest / land use ----------------------------------------
  forest_change           text,                 -- None | Reforestation | Deforestation
  forest_type             text,
  forest_removed_age      int,
  final_year_pruning_perc numeric,
  de_area_raw             numeric,
  de_area_uom             text,
  de_area_ha              numeric,              -- NORMALISED; signed in v_cfp_farm_analytics

  -- ---- rolled-up derived intensities (from child tables) --------
  -- Stored rather than joined at query time: the dashboard filters on
  -- these, and 3.2k rows makes staleness a non-issue (ETL recomputes).
  n_kg_per_ha             numeric,              -- sum over fertiliser rows (parsed N%)
  p2o5_kg_per_ha          numeric,
  k2o_kg_per_ha           numeric,
  organic_fert_share      numeric,              -- 0-1 share of applications
  ai_kg_per_ha            numeric,              -- pesticide active ingredient load
  tonne_km                numeric,              -- sum over transport rows
  energy_litres           numeric,
  irrigation_water_m3     numeric,
  shade_cover_perc        numeric,              -- sum of shade_tress_perc
  intercrop_cover_perc    numeric,
  hedge_area_m2           numeric,
  residue_burn_share      numeric,              -- mean burn % across burn-capable streams

  loaded_at               timestamptz not null default now()
);

comment on table cfp_submissions is
  'One row per Cool Farm crop assessment. Cleaned + unit-normalised. Excludes farmer names/phone by policy. Precise GPS retained for geospatial analytics; all access authenticated.';
comment on column cfp_submissions.area_ha is 'Normalised to hectares. Source was acres for 3003/3254 rows.';
comment on column cfp_submissions.n_kg_per_ha is 'Derived: sum(rate_kg_per_ha * n_pct/100) over fertiliser applications. n_pct parsed from the fertiliser_type LABEL (78.8% coverage) because the explicit fertiliser_n_* fields are populated in only 11/2099 rows.';
comment on column cfp_submissions.residue_burn_share is 'Mean burn %% across the 6 streams that offer a burn fate (pruning, leaf_litter, dead_plant, end_of_life_cycle, woody_roots, end_leaves).';

create index if not exists cfp_sub_project_idx   on cfp_submissions (project);
create index if not exists cfp_sub_region_idx    on cfp_submissions (region);
create index if not exists cfp_sub_district_idx  on cfp_submissions (district);
create index if not exists cfp_sub_crop_idx      on cfp_submissions (crop_type);
create index if not exists cfp_sub_gender_idx    on cfp_submissions (gender);
create index if not exists cfp_sub_month_idx     on cfp_submissions (submission_month);
create index if not exists cfp_sub_geo_idx       on cfp_submissions (latitude, longitude);

-- ---------------------------------------------------------------------
-- 2. Residue fates -- LONG format
--    43 wide columns (9 streams x 3-6 fates) collapse to one tidy table.
--    Makes the flagship 100%-stacked chart a single group-by.
-- ---------------------------------------------------------------------
create table if not exists cfp_residue_fates (
  submission_id uuid not null references cfp_submissions(submission_id) on delete cascade,
  stream        text not null,   -- pruning | leaf_litter | fruit | dead_plant |
                                 -- end_of_life_cycle | life_cycle_end_woody_roots |
                                 -- life_cycle_end_leaves | pulp_hask | seed
  fate          text not null,   -- burn | heaps_pits | aerobic_compost |
                                 -- anaerobic_compost | left_on_soil | export
  pct           numeric,
  primary key (submission_id, stream, fate)
);
comment on table cfp_residue_fates is
  'Residue disposal split, long format. 100% populated upstream; 99.8% of stream-splits sum to exactly 100.';
create index if not exists cfp_residue_stream_idx on cfp_residue_fates (stream, fate);

-- ---------------------------------------------------------------------
-- 3. Yield lifecycle curve -- LONG format (the one required reshape)
--    NB: pct_of_peak, NOT tonnes. See the caveat in data-architecture.md.
-- ---------------------------------------------------------------------
create table if not exists cfp_yield_curve (
  submission_id uuid not null references cfp_submissions(submission_id) on delete cascade,
  year_offset   int  not null,   -- 0..30, where 0 = assessment year
  calendar_year int,             -- from the year_N_label calculate fields
  pct_of_peak   numeric,
  primary key (submission_id, year_offset)
);
comment on table cfp_yield_curve is
  'Reshaped from yield_est_year_0..30. These are PERCENT OF PEAK YIELD, not tonnes, and are largely template values (2778 rows show a mature crop with year-0 = 0). Present for completeness; do not chart as farm performance.';

-- ---------------------------------------------------------------------
-- 4. Repeat groups (one child table each, FK on submission_id)
-- ---------------------------------------------------------------------
create table if not exists cfp_fertilizer_applications (
  id                 bigserial primary key,
  submission_id      uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq                int  not null,
  category           text,          -- standard | compose_own
  fertiliser_type    text,
  is_organic         boolean,       -- derived from the type label
  prod_region        text,
  rate_raw           numeric,
  rate_uom           text,
  rate_kg_per_ha     numeric,       -- NORMALISED (litres treated as kg, flagged)
  n_pct              numeric,       -- parsed from the type label
  p2o5_pct           numeric,
  k2o_pct            numeric,
  n_kg_per_ha        numeric,       -- rate_kg_per_ha * n_pct/100
  -- explicit composition fields: populated for compose_own only (11 rows)
  n_ammonium_pct     numeric,
  n_nitrate_pct      numeric,
  n_urea_pct         numeric,
  explicit_p2o5_pct  numeric,
  explicit_k2o_pct   numeric,
  n_other_pct        numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_fert_sub_idx on cfp_fertilizer_applications (submission_id);

create table if not exists cfp_pesticide_applications (
  id                    bigserial primary key,
  submission_id         uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq                   int  not null,
  category              text,
  pesticide_type        text,
  perc_field_applied    numeric,
  active_ingredient_pct numeric,
  rate_raw              numeric,
  rate_uom              text,
  rate_per_ha           numeric,   -- NORMALISED to per-hectare (litres or kg)
  ai_kg_per_ha          numeric,   -- rate_per_ha * ai% * field%
  unique (submission_id, seq)
);
create index if not exists cfp_pest_sub_idx on cfp_pesticide_applications (submission_id);

create table if not exists cfp_energy_use (
  id                 bigserial primary key,
  submission_id      uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq                int  not null,
  measurement_method text,
  energy_source      text,
  amount_raw         numeric,
  amount_uom         text,
  amount_litres      numeric,
  use_categories     text[],      -- select_multiple, split on whitespace
  unique (submission_id, seq)
);
create index if not exists cfp_energy_sub_idx on cfp_energy_use (submission_id);

create table if not exists cfp_irrigation_use (
  id                   bigserial primary key,
  submission_id        uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq                  int  not null,
  irrigation_method    text,
  water_source         text,
  power_source         text,
  perc_field_irrigated numeric,
  water_added_raw      numeric,
  water_added_uom      text,
  water_added_m3       numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_irrig_sub_idx on cfp_irrigation_use (submission_id);

create table if not exists cfp_transport_use (
  id            bigserial primary key,
  submission_id uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq           int  not null,
  transport_type text,
  boundary      text,
  weight_raw    numeric,
  weight_uom    text,
  weight_kg     numeric,      -- NORMALISED
  distance_km   numeric,
  tonne_km      numeric,      -- weight_kg/1000 * distance_km
  unique (submission_id, seq)
);
create index if not exists cfp_transport_sub_idx on cfp_transport_use (submission_id);

create table if not exists cfp_intercrops (
  id              bigserial primary key,
  submission_id   uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq             int  not null,
  intercrop_type  text,
  cover_perc      numeric,
  density_raw     numeric,
  density_uom     text,
  density_per_ha  numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_intercrop_sub_idx on cfp_intercrops (submission_id);

create table if not exists cfp_shade_trees (
  id              bigserial primary key,
  submission_id   uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq             int  not null,
  shade_type_raw  text,        -- as collected, incl. the 'Torpical' typo
  shade_type      text,        -- CLEANED: Torpical -> Tropical (413 instances)
  cover_perc      numeric,
  density_raw     numeric,
  density_uom     text,
  density_per_ha  numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_shade_sub_idx on cfp_shade_trees (submission_id);

create table if not exists cfp_hedges (
  id            bigserial primary key,
  submission_id uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq           int  not null,
  hedge_type    text,
  width_m       numeric,
  length_m      numeric,
  area_m2       numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_hedge_sub_idx on cfp_hedges (submission_id);

create table if not exists cfp_wastewater_treatments (
  id                 bigserial primary key,
  submission_id      uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq                int  not null,
  oxygen_demand_type text,
  treatment_process  text,
  volume_raw         numeric,
  volume_uom         text,
  volume_litres      numeric,
  oxygen_demand      numeric,
  oxygen_demand_uom  text,
  unique (submission_id, seq)
);
comment on table cfp_wastewater_treatments is
  'Effectively empty: 1 instance across 3254 submissions (12 farms answered yes). Kept for schema completeness / future collection.';

create table if not exists cfp_land_use_change (
  id             bigserial primary key,
  submission_id  uuid not null references cfp_submissions(submission_id) on delete cascade,
  seq            int  not null,
  change_year_raw int,
  change_year    int,          -- cleaned: values < 1900 treated as unusable
  previous_use   text,
  new_use        text,
  change_perc    numeric,
  unique (submission_id, seq)
);
create index if not exists cfp_luc_sub_idx on cfp_land_use_change (submission_id);
create index if not exists cfp_luc_transition_idx on cfp_land_use_change (previous_use, new_use);

-- ---------------------------------------------------------------------
-- 5. Data-quality flags (drives the DQ tile + drill-down)
-- ---------------------------------------------------------------------
create table if not exists cfp_dq_flags (
  id            bigserial primary key,
  submission_id uuid not null references cfp_submissions(submission_id) on delete cascade,
  code          text not null,   -- e.g. 'yes_but_empty', 'out_of_range', 'unit_suspect'
  severity      text not null,   -- 'error' | 'warning' | 'info'
  field         text,
  detail        text
);
create index if not exists cfp_dq_sub_idx  on cfp_dq_flags (submission_id);
create index if not exists cfp_dq_code_idx on cfp_dq_flags (code, severity);

-- ---------------------------------------------------------------------
-- 6. Sync bookkeeping (matches vsla_/cva_sync_meta shape)
-- ---------------------------------------------------------------------
create table if not exists cfp_sync_meta (
  id                integer primary key default 1,
  last_synced_at    timestamptz,
  last_kobo_id      bigint,        -- high-water mark for incremental sync
  last_submitted_at timestamptz,
  n_submissions     integer,
  n_residue_rows    integer,
  n_yield_rows      integer,
  n_fertilizer_rows integer,
  n_pesticide_rows  integer,
  n_transport_rows  integer,
  n_agroforestry_rows integer,
  n_landuse_rows    integer,
  n_dq_flags        integer,
  notes             text,
  constraint cfp_sync_meta_singleton check (id = 1)
);
insert into cfp_sync_meta (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. RLS
--     DELIBERATE DIVERGENCE from cva_/vsla_, which allow anon SELECT
--     (qual: true). This dataset carries precise GPS for 3,254 named-
--     in-source individuals plus gender/age/disability/household size --
--     anon-readable rows would be a re-identification risk. All reads
--     require an authenticated session; the service role (ETL) bypasses
--     RLS entirely.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'cfp_raw_submissions','cfp_submissions','cfp_residue_fates','cfp_yield_curve',
    'cfp_fertilizer_applications','cfp_pesticide_applications','cfp_energy_use',
    'cfp_irrigation_use','cfp_transport_use','cfp_intercrops','cfp_shade_trees',
    'cfp_hedges','cfp_wastewater_treatments','cfp_land_use_change','cfp_dq_flags',
    'cfp_sync_meta'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_sel', t);
    execute format(
      'create policy %I on %I for select using (auth.uid() is not null)', t||'_sel', t);
  end loop;
end $$;

-- Raw landing zone is stricter still: it contains names and phone numbers.
-- Only the service role (which bypasses RLS) may read it.
drop policy if exists cfp_raw_submissions_sel on cfp_raw_submissions;
comment on table cfp_raw_submissions is
  'PII: contains farmer names + phone numbers. RLS enabled with NO select policy => unreachable via anon/authenticated keys; service role only.';

commit;
