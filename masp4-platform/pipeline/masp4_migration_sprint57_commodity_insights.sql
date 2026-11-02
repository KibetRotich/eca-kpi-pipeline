-- Sprint 57: Commodity Insights, a continuation of Thematic Insights (applied 2026-11-02).
-- A commodity is stored as an evaluation_themes row with kind = 'commodity', so it reuses theme_insights, the
-- review queue and publish_theme_insight unchanged. /thematic-insights lists themes first, then a
-- "Commodity Insights" section. A commodity synthesis's board scorecard and change rows name THEMES, not commodities.
-- Coffee is the first commodity; others follow one at a time (sort_order 101+).

alter table public.evaluation_themes
  add column if not exists kind text not null default 'theme' check (kind in ('theme', 'commodity'));

insert into public.evaluation_themes (key, title, description, sort_order, kind) values
  ('coffee', 'Coffee', 'What the studies say about coffee across every theme: yields, incomes, prices, climate, finance, women and youth, working conditions and policy.', 101, 'commodity')
on conflict (key) do update
  set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order, kind = excluded.kind;
