-- =====================================================================
-- Sprint 23b - Cool Farm (CFP) analytics views
--
-- Two view shapes, deliberately:
--
--   1. ROW-GRAIN views (v_cfp_farm_analytics, v_cfp_*_long) return one row
--      per submission (or per child record) and carry the filter dimensions
--      -- project / region / district / crop / gender / month -- on every
--      row. The dashboard filters these and aggregates client-side. With
--      ~3.2k farms this is far more flexible than pre-aggregating, because
--      any tile can be re-cut by any filter without a new view.
--
--   2. AGGREGATE views (v_cfp_overview, v_cfp_district_geo, ...) are for
--      tiles where the aggregate itself is the point (KPI strip, choropleth)
--      or where the client would otherwise pull far more rows than it needs.
--
-- All views are security_invoker = true so the caller's RLS applies: no view
-- becomes a privilege-escalation path around cfp_submissions. PostGIS is not
-- installed on this project, so geospatial maths is plain trigonometry.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Farm-grain analytics spine -- the dashboard's primary source
-- ---------------------------------------------------------------------
create or replace view v_cfp_farm_analytics
with (security_invoker = true) as
select
  s.submission_id, s.kobo_id, s.submitted_at, s.submission_month,
  -- filter dimensions
  s.country, s.region, s.district, s.project, s.enumerator,
  s.crop_type, s.crop_species, s.crop_system, s.is_shaded,
  s.gender, s.age_band, s.is_youth, s.literacy_level,
  s.soil_type, s.crop_age_band, s.assessment_year,
  -- geography
  s.latitude, s.longitude,
  -- scale
  s.area_ha, s.household_size, s.plants_per_ha, s.crop_age,
  -- derived intensities (the approved "middle tier")
  s.total_yield_t, s.yield_t_per_ha,
  s.n_kg_per_ha, s.p2o5_kg_per_ha, s.k2o_kg_per_ha, s.organic_fert_share,
  s.ai_kg_per_ha, s.tonne_km, s.energy_litres, s.irrigation_water_m3,
  s.shade_cover_perc, s.intercrop_cover_perc, s.hedge_area_m2,
  s.residue_burn_share,
  s.dead_plants_perc, s.waste_fruit_perc,
  -- practice adoption
  s.fertilizer_applied, s.pesticide_applied, s.fuel_energy_used,
  s.irrigation_used, s.wastewater_treated, s.intercrop_exists,
  s.shade_trees_exist, s.hedges_exist, s.land_use_change_exists,
  s.cooperative_member, s.disability, s.access_to_mobile_device,
  s.access_to_internet, s.dead_plants_replaced,
  -- land use / forest
  s.forest_change, s.de_area_ha,
  case s.forest_change
    when 'Reforestation' then coalesce(s.de_area_ha, 0)
    when 'Deforestation' then -coalesce(s.de_area_ha, 0)
    else 0 end as net_forest_area_ha,
  -- data quality rollup
  (select count(*) from cfp_dq_flags f
     where f.submission_id = s.submission_id) as dq_flag_count,
  (select count(*) from cfp_dq_flags f
     where f.submission_id = s.submission_id and f.severity = 'error') as dq_error_count
from cfp_submissions s;

comment on view v_cfp_farm_analytics is
  'One row per assessed farm with all filter dimensions and derived intensity metrics. Primary source for the dashboard; filter this rather than pre-aggregating.';

-- ---------------------------------------------------------------------
-- 2. Overview KPI strip
-- ---------------------------------------------------------------------
create or replace view v_cfp_overview
with (security_invoker = true) as
select
  count(*)                                              as farmers_assessed,
  round(sum(area_ha), 1)                                as total_area_ha,
  round(avg(area_ha), 3)                                as mean_area_ha,
  percentile_cont(0.5) within group (order by area_ha)  as median_area_ha,
  sum(household_size)                                   as people_in_households,
  count(distinct district)                              as districts,
  count(distinct region)                                as regions,
  count(distinct project)                               as projects,
  count(distinct enumerator)                            as enumerators,
  round(100.0 * count(*) filter (where gender = 'female') / count(*), 1) as pct_female,
  round(100.0 * count(*) filter (where is_youth)         / count(*), 1) as pct_youth,
  round(100.0 * count(*) filter (where cooperative_member) / count(*), 1) as pct_coop_member,
  round(100.0 * count(*) filter (where is_shaded)        / count(*), 1) as pct_shaded,
  round(100.0 * count(*) filter (where disability)       / count(*), 1) as pct_disability,
  -- practice adoption
  round(100.0 * count(*) filter (where fertilizer_applied) / count(*), 1) as pct_fertilizer,
  round(100.0 * count(*) filter (where pesticide_applied)  / count(*), 1) as pct_pesticide,
  round(100.0 * count(*) filter (where shade_trees_exist)  / count(*), 1) as pct_shade_trees,
  round(100.0 * count(*) filter (where intercrop_exists)   / count(*), 1) as pct_intercrop,
  round(100.0 * count(*) filter (where hedges_exist)       / count(*), 1) as pct_hedges,
  round(100.0 * count(*) filter (where irrigation_used)    / count(*), 1) as pct_irrigated,
  round(100.0 * count(*) filter (where fuel_energy_used)   / count(*), 1) as pct_fuel_energy,
  round(100.0 * count(*) filter (where land_use_change_exists) / count(*), 1) as pct_land_use_change,
  -- headline residue metric
  round(avg(residue_burn_share), 1)                     as mean_burn_share,
  -- derived intensities: medians, because every one of these has a long tail
  percentile_cont(0.5) within group (order by yield_t_per_ha) as median_yield_t_per_ha,
  percentile_cont(0.5) within group (order by n_kg_per_ha)    as median_n_kg_per_ha,
  percentile_cont(0.5) within group (order by tonne_km)       as median_tonne_km,
  percentile_cont(0.5) within group (order by shade_cover_perc) as median_shade_cover_perc,
  round(sum(case forest_change when 'Reforestation' then coalesce(de_area_ha,0)
                               when 'Deforestation' then -coalesce(de_area_ha,0)
                               else 0 end), 2)          as net_forest_area_ha,
  min(submitted_at) as first_submission,
  max(submitted_at) as last_submission
from cfp_submissions;

-- ---------------------------------------------------------------------
-- 3. FLAGSHIP: residue fate mix, long + filterable
-- ---------------------------------------------------------------------
create or replace view v_cfp_residue_long
with (security_invoker = true) as
select
  r.submission_id, r.stream, r.fate, r.pct,
  s.project, s.region, s.district, s.crop_type, s.crop_species,
  s.crop_system, s.gender, s.submission_month, s.area_ha
from cfp_residue_fates r
join cfp_submissions s using (submission_id);

comment on view v_cfp_residue_long is
  'Residue disposal split in long form with filter dimensions attached. Group by stream+fate for the 100%-stacked flagship chart.';

-- Pre-aggregated companion for the default (unfiltered) view of the chart
create or replace view v_cfp_residue_mix
with (security_invoker = true) as
select
  stream,
  fate,
  count(*)                          as n_farms,
  round(avg(pct), 2)                as mean_pct,
  count(*) filter (where pct > 0)   as n_farms_using,
  count(*) filter (where pct = 100) as n_farms_exclusive
from cfp_residue_fates
group by stream, fate;

-- Burn-specific rollup: the dashboard's headline number
create or replace view v_cfp_burn_summary
with (security_invoker = true) as
select
  r.stream,
  count(*)                                                  as n_farms,
  round(avg(r.pct), 1)                                      as mean_burn_pct,
  count(*) filter (where r.pct > 0)                         as n_burning_any,
  round(100.0 * count(*) filter (where r.pct > 0) / count(*), 1) as pct_burning_any,
  count(*) filter (where r.pct = 100)                       as n_burning_all
from cfp_residue_fates r
where r.fate = 'burn'
group by r.stream;

-- ---------------------------------------------------------------------
-- 4. GEOSPATIAL
-- ---------------------------------------------------------------------

-- 4a. Point layer. Coordinates rounded to 3dp (~110 m) so the map cannot be
--     used to navigate to an individual homestead; village name excluded.
create or replace view v_cfp_geo_points
with (security_invoker = true) as
select
  s.submission_id,
  round(s.latitude,  3) as lat,
  round(s.longitude, 3) as lon,
  s.region, s.district, s.project,
  s.crop_type, s.crop_species, s.crop_system, s.gender, s.submission_month,
  s.area_ha, s.residue_burn_share, s.shade_cover_perc,
  s.n_kg_per_ha, s.yield_t_per_ha, s.tonne_km,
  s.forest_change, s.fertilizer_applied, s.pesticide_applied
from cfp_submissions s
where s.latitude is not null and s.longitude is not null;

comment on view v_cfp_geo_points is
  'Map point layer. Coordinates deliberately rounded to ~110 m and village omitted: precise homestead locations are not exposed even to authenticated viewers.';

-- 4b. District choropleth + centroid (all metrics in one row per district,
--     so the map can switch metric without refetching)
create or replace view v_cfp_district_geo
with (security_invoker = true) as
select
  s.district,
  s.region,
  count(*)                                     as n_farms,
  round(avg(s.latitude)::numeric,  5)          as centroid_lat,
  round(avg(s.longitude)::numeric, 5)          as centroid_lon,
  round(sum(s.area_ha), 2)                     as total_area_ha,
  round(avg(s.area_ha), 3)                     as mean_area_ha,
  round(avg(s.residue_burn_share), 1)          as mean_burn_share,
  round(avg(s.shade_cover_perc), 1)            as mean_shade_cover_perc,
  round(avg(s.n_kg_per_ha), 2)                 as mean_n_kg_per_ha,
  percentile_cont(0.5) within group (order by s.yield_t_per_ha) as median_yield_t_per_ha,
  round(avg(s.tonne_km), 2)                    as mean_tonne_km,
  round(100.0 * count(*) filter (where s.fertilizer_applied) / count(*), 1) as pct_fertilizer,
  round(100.0 * count(*) filter (where s.pesticide_applied)  / count(*), 1) as pct_pesticide,
  round(100.0 * count(*) filter (where s.shade_trees_exist)  / count(*), 1) as pct_shade_trees,
  round(100.0 * count(*) filter (where s.is_shaded)          / count(*), 1) as pct_shaded,
  round(100.0 * count(*) filter (where s.gender='female')    / count(*), 1) as pct_female,
  count(*) filter (where s.forest_change = 'Deforestation')   as n_deforestation,
  count(*) filter (where s.forest_change = 'Reforestation')   as n_reforestation
from cfp_submissions s
where s.district is not null
group by s.district, s.region;

-- 4c. Region rollup (same shape, coarser)
create or replace view v_cfp_region_geo
with (security_invoker = true) as
select
  s.region,
  count(*)                            as n_farms,
  count(distinct s.district)          as n_districts,
  round(avg(s.latitude)::numeric,  5) as centroid_lat,
  round(avg(s.longitude)::numeric, 5) as centroid_lon,
  round(sum(s.area_ha), 2)            as total_area_ha,
  round(avg(s.residue_burn_share), 1) as mean_burn_share,
  round(avg(s.shade_cover_perc), 1)   as mean_shade_cover_perc,
  round(avg(s.n_kg_per_ha), 2)        as mean_n_kg_per_ha,
  round(100.0 * count(*) filter (where s.is_shaded) / count(*), 1) as pct_shaded
from cfp_submissions s
where s.region is not null
group by s.region;

-- 4d. Spatial outliers: farms sitting far from the centroid of their own
--     stated district. Catches mis-selected districts and GPS taken away
--     from the farm. No boundary data is needed -- distance to the district's
--     own centroid is enough to rank suspects. Haversine, since PostGIS is
--     not installed.
create or replace view v_cfp_geo_outliers
with (security_invoker = true) as
with c as (
  select district, avg(latitude) clat, avg(longitude) clon, count(*) n
  from cfp_submissions
  where latitude is not null and district is not null
  group by district
)
select
  s.submission_id, s.district, s.region, s.project,
  round(s.latitude, 4) as lat, round(s.longitude, 4) as lon,
  c.n as district_n_farms,
  round((6371 * acos(least(1, greatest(-1,
      sin(radians(s.latitude)) * sin(radians(c.clat))
    + cos(radians(s.latitude)) * cos(radians(c.clat))
      * cos(radians(c.clon - s.longitude))
  ))))::numeric, 2) as km_from_district_centroid
from cfp_submissions s
join c on c.district = s.district
where s.latitude is not null;

comment on view v_cfp_geo_outliers is
  'Distance from each farm to the centroid of its stated district. Filter to a threshold (e.g. > 50 km) to surface probable district mis-selection or GPS captured off-farm.';

-- ---------------------------------------------------------------------
-- 5. Input sections (long + filterable)
-- ---------------------------------------------------------------------
create or replace view v_cfp_fertilizer_long
with (security_invoker = true) as
select
  f.submission_id, f.seq, f.category, f.fertiliser_type, f.is_organic,
  f.prod_region, f.rate_raw, f.rate_uom, f.rate_kg_per_ha,
  f.n_pct, f.p2o5_pct, f.k2o_pct, f.n_kg_per_ha,
  s.project, s.region, s.district, s.crop_type, s.crop_species,
  s.gender, s.submission_month, s.area_ha
from cfp_fertilizer_applications f
join cfp_submissions s using (submission_id);

create or replace view v_cfp_pesticide_long
with (security_invoker = true) as
select
  p.submission_id, p.seq, p.category, p.pesticide_type,
  p.perc_field_applied, p.active_ingredient_pct,
  p.rate_raw, p.rate_uom, p.rate_per_ha, p.ai_kg_per_ha,
  s.project, s.region, s.district, s.crop_type, s.crop_species,
  s.gender, s.submission_month, s.area_ha
from cfp_pesticide_applications p
join cfp_submissions s using (submission_id);

create or replace view v_cfp_transport_long
with (security_invoker = true) as
select
  t.submission_id, t.seq, t.transport_type, t.boundary,
  t.weight_kg, t.distance_km, t.tonne_km,
  s.project, s.region, s.district, s.crop_species, s.submission_month
from cfp_transport_use t
join cfp_submissions s using (submission_id);

-- Agroforestry: intercrop + shade + hedge unioned into one tidy layer
create or replace view v_cfp_agroforestry_long
with (security_invoker = true) as
select i.submission_id, 'intercrop'::text as kind, i.intercrop_type as species,
       i.cover_perc, i.density_per_ha, null::numeric as area_m2,
       s.project, s.region, s.district, s.crop_species, s.crop_system, s.submission_month
from cfp_intercrops i join cfp_submissions s using (submission_id)
union all
select h.submission_id, 'shade_tree', h.shade_type,
       h.cover_perc, h.density_per_ha, null::numeric,
       s.project, s.region, s.district, s.crop_species, s.crop_system, s.submission_month
from cfp_shade_trees h join cfp_submissions s using (submission_id)
union all
select g.submission_id, 'hedge', g.hedge_type,
       null::numeric, null::numeric, g.area_m2,
       s.project, s.region, s.district, s.crop_species, s.crop_system, s.submission_month
from cfp_hedges g join cfp_submissions s using (submission_id);

-- Rare inputs (energy + irrigation + wastewater) in one thin layer, since
-- none of the three has the volume to justify its own section
create or replace view v_cfp_rare_inputs
with (security_invoker = true) as
select e.submission_id, 'energy'::text as kind,
       e.energy_source as detail, e.amount_litres as amount,
       'litres'::text as unit, s.project, s.region, s.district
from cfp_energy_use e join cfp_submissions s using (submission_id)
union all
select i.submission_id, 'irrigation', i.irrigation_method,
       i.water_added_m3, 'm3', s.project, s.region, s.district
from cfp_irrigation_use i join cfp_submissions s using (submission_id)
union all
select w.submission_id, 'wastewater', w.treatment_process,
       w.volume_litres, 'litres', s.project, s.region, s.district
from cfp_wastewater_treatments w join cfp_submissions s using (submission_id);

-- ---------------------------------------------------------------------
-- 6. Land-use transition matrix (Sankey source)
-- ---------------------------------------------------------------------
create or replace view v_cfp_land_use_transitions
with (security_invoker = true) as
select
  l.previous_use,
  l.new_use,
  count(*)                    as n_transitions,
  count(distinct l.submission_id) as n_farms,
  round(avg(l.change_perc), 1) as mean_field_pct,
  round(sum(s.area_ha * l.change_perc / 100.0)::numeric, 2) as approx_area_ha,
  min(l.change_year)          as earliest_year,
  max(l.change_year)          as latest_year
from cfp_land_use_change l
join cfp_submissions s using (submission_id)
where l.previous_use is not null and l.new_use is not null
group by l.previous_use, l.new_use;

comment on view v_cfp_land_use_transitions is
  'Previous -> new land use transition matrix. approx_area_ha applies the reported field percentage to the farm area; treat as indicative.';

create or replace view v_cfp_land_use_long
with (security_invoker = true) as
select
  l.submission_id, l.seq, l.change_year, l.previous_use, l.new_use, l.change_perc,
  s.project, s.region, s.district, s.crop_species, s.area_ha
from cfp_land_use_change l
join cfp_submissions s using (submission_id);

-- ---------------------------------------------------------------------
-- 7. Yield lifecycle curve -- shipped with an explicit caveat
-- ---------------------------------------------------------------------
create or replace view v_cfp_yield_curve
with (security_invoker = true) as
select
  y.year_offset,
  count(*)                                   as n_farms,
  round(avg(y.pct_of_peak), 1)               as mean_pct_of_peak,
  percentile_cont(0.5) within group (order by y.pct_of_peak) as median_pct_of_peak,
  s.crop_type, s.crop_species, s.project, s.region
from cfp_yield_curve y
join cfp_submissions s using (submission_id)
group by y.year_offset, s.crop_type, s.crop_species, s.project, s.region;

comment on view v_cfp_yield_curve is
  'CAVEAT: pct_of_peak, NOT tonnes, and largely generic template values (2778 farms report a mature crop with year-0 = 0). Label any chart built on this as a lifecycle assumption, never as farm performance.';

-- ---------------------------------------------------------------------
-- 8. Data quality + field activity
-- ---------------------------------------------------------------------
create or replace view v_cfp_dq_summary
with (security_invoker = true) as
select
  f.code, f.severity, f.field,
  count(*)                         as n_flags,
  count(distinct f.submission_id)  as n_submissions,
  round(100.0 * count(distinct f.submission_id)
        / (select count(*) from cfp_submissions), 1) as pct_submissions
from cfp_dq_flags f
group by f.code, f.severity, f.field;

create or replace view v_cfp_dq_by_submission
with (security_invoker = true) as
select
  s.submission_id, s.kobo_id, s.district, s.region, s.project, s.enumerator,
  s.submission_month,
  count(f.id)                                      as n_flags,
  count(f.id) filter (where f.severity = 'error')  as n_errors,
  count(f.id) filter (where f.severity = 'warning') as n_warnings,
  string_agg(distinct f.code, ', ' order by f.code) as codes
from cfp_submissions s
left join cfp_dq_flags f using (submission_id)
group by s.submission_id, s.kobo_id, s.district, s.region, s.project,
         s.enumerator, s.submission_month;

create or replace view v_cfp_field_activity
with (security_invoker = true) as
select
  s.submission_month,
  s.enumerator,
  s.region,
  s.project,
  count(*)                                  as n_submissions,
  round(avg(s.area_ha), 3)                  as mean_area_ha,
  count(*) filter (where s.latitude is null) as n_missing_gps,
  round(avg((select count(*) from cfp_dq_flags f
             where f.submission_id = s.submission_id)), 2) as mean_flags_per_submission
from cfp_submissions s
group by s.submission_month, s.enumerator, s.region, s.project;

-- ---------------------------------------------------------------------
-- 9. Categorical breakdown helper -- saves ~10 near-identical views.
--    Returns every low-cardinality categorical as (dimension, value, n)
--    so demographic/characteristic bar charts share one query path.
-- ---------------------------------------------------------------------
create or replace view v_cfp_categorical_counts
with (security_invoker = true) as
with base as (
  select project, region, district, crop_species, gender,
         age_band, literacy_level, crop_type, crop_system, soil_type,
         crop_age_band, mobile_device_type, disability_form, forest_change
  from cfp_submissions
), unpivoted as (
  select 'gender'             as dimension, gender             as value, base.* from base
  union all select 'age_band',           age_band,           base.* from base
  union all select 'literacy_level',     literacy_level,     base.* from base
  union all select 'crop_type',          crop_type,          base.* from base
  union all select 'crop_system',        crop_system,        base.* from base
  union all select 'soil_type',          soil_type,          base.* from base
  union all select 'crop_age_band',      crop_age_band,      base.* from base
  union all select 'mobile_device_type', mobile_device_type, base.* from base
  union all select 'disability_form',    disability_form,    base.* from base
  union all select 'forest_change',      forest_change,      base.* from base
  union all select 'region',             region,             base.* from base
  union all select 'district',           district,           base.* from base
  union all select 'project',            project,            base.* from base
)
select dimension, value, project, region, district, crop_species, gender, count(*) as n
from unpivoted
where value is not null
group by dimension, value, project, region, district, crop_species, gender;
