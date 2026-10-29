-- Sprint 56: Thematic Insights theme changes, at the user's request (applied 2026-10-29).
-- "Social Inclusion" is renamed "Women & Youth Empowerment" (key 'inclusion' kept so links and syntheses still resolve),
-- and a new "Policy & Governance" theme is added.

update public.evaluation_themes
   set title = 'Women & Youth Empowerment',
       description = 'Women''s and youth participation, leadership, decision-making, economic empowerment and gender-based violence.'
 where key = 'inclusion';

insert into public.evaluation_themes (key, title, description, sort_order) values
  ('governance', 'Policy & Governance', 'Policy engagement and influence, public-private dialogue, regulation and standards, and the governance of cooperatives and producer organisations.', 12)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;
