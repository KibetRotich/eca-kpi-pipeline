-- Sprint 48: UG seedlings fulfilment counts ALL applications.
-- The 2023–24 rounds had no distributions, so they count as not served (previously
-- excluded via submitted_at >= 2025-01-01), matching Seedlings_Dashboard.html.
create or replace view v_ug_seed_fulfilment_district with (security_invoker = true) as
select region, district,
       count(*) as applications,
       count(*) filter (where is_distributed) as served,
       round(100.0 * count(*) filter (where is_distributed)::numeric / nullif(count(*), 0)::numeric, 1) as fulfilment_pct,
       sum(total_seedlings) as seedlings_applied,
       sum(seedlings_given) as seedlings_given,
       percentile_cont(0.5) within group (order by days_to_distribution::double precision) as median_days
  from ug_seed_applications
 group by region, district;
