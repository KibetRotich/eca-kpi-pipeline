-- Sprint 55: "Access to Services" Thematic Insights theme, at the user's request (applied 2026-10-29).
-- Its synthesis was built from the published studies and published the same day (rated "moderate").

insert into public.evaluation_themes (key, title, description, sort_order) values
  ('services', 'Access to Services', 'Access to extension and training, inputs and seedlings, mechanisation, soil testing, veterinary, advisory and digital services.', 11)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;
