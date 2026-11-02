-- Sprint 58: the remaining Commodity Insights pages after Coffee (applied 2026-11-02). Rows only; see Sprint 57.
-- Names follow lib/themes.ts COMMODITIES. Commodity pages also render synthesis.charts ("In figures").

insert into public.evaluation_themes (key, title, description, sort_order, kind) values
  ('dairy',      'Dairy',               'What the studies say about dairy across every theme: milk yields and collection, hubs and cooperatives, incomes, services, finance, women and methane.', 102, 'commodity'),
  ('fv',         'Fruits & Vegetables', 'What the studies say about fruits and vegetables (F&V) across every theme: value shares, buyers and brokers, practices, climate, finance, food security and policy.', 103, 'commodity'),
  ('tea',        'Tea',                 'What the studies say about tea across every theme: yield gaps, green-leaf prices, living income and wages, women, certification and tea policy.', 104, 'commodity'),
  ('maize',      'Maize',               'What the studies say about maize across every theme: yields, climate-smart practices, aggregation and prices, savings, food security and women.', 105, 'commodity'),
  ('food_crops', 'Food Crops',          'What the studies say about food crops across every theme: practices, yields, markets, incomes, finance and food security.', 106, 'commodity'),
  ('gold',       'Gold',                'What the studies say about artisanal gold mining across every theme: mercury, safety, gold recovery, prices, women, finance and mining policy.', 107, 'commodity'),
  ('oil_palm',   'Oil Palm',            'What the studies say about oil palm across every theme: incomes, land for food, emissions and deforestation, finance, child labour and women.', 108, 'commodity'),
  ('leather',    'Leather',             'What the studies say about leather across every theme: tanneries, working conditions, enterprises and youth jobs, savings groups and markets for greener leather.', 109, 'commodity'),
  ('cotton',     'Cotton & Textiles',   'What the studies say about cotton and textiles across every theme: wages and unions, factory safety and environment, women workers and smallholder cotton.', 110, 'commodity'),
  ('livestock',  'Livestock & Beef',    'What the studies say about livestock and beef across every theme: breeding stock, markets, services and climate.', 111, 'commodity'),
  ('beans',      'Beans & Barley',      'What the studies say about beans and barley across every theme (baseline evidence only).', 112, 'commodity')
on conflict (key) do update
  set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order, kind = excluded.kind;
