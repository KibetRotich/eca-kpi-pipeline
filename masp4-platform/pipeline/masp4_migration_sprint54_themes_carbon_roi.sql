-- Sprint 54: two more Thematic Insights themes, at the user's request (applied 2026-10-29).
-- Their syntheses were built from the 68 published studies and published the same day (both rated "limited").

insert into public.evaluation_themes (key, title, description, sort_order) values
  ('carbon_pes', 'Carbon & PES', 'Carbon credits and insetting, greenhouse gas footprints, and payments for ecosystem services (PES) reaching producers.', 9),
  ('roi', 'Return on Investment', 'Cost per beneficiary, value for money, returns to farmers and partners, and leveraged or blended finance.', 10)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;
