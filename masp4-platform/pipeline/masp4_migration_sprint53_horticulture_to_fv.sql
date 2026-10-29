-- Sprint 53: the commodity "Horticulture" is renamed "F&V" (fruits & vegetables) at the user's request.
-- Applied 2026-10-29. theme_insights syntheses were updated in the same step (commodity labels and text;
-- project names such as "Horticulture for Growth (H4G)" kept).

alter table public.evaluation_reports drop constraint if exists evaluation_reports_commodities_check;
update public.evaluation_reports set commodities = array_replace(commodities, 'Horticulture', 'F&V')
 where 'Horticulture' = any(commodities);
alter table public.evaluation_reports add constraint evaluation_reports_commodities_check check (
  commodities <@ array['Coffee','Maize','Food crops','F&V','Dairy','Livestock & beef','Tea','Oil palm',
                       'Beans & barley','Cotton & textiles','Leather','Gold']::text[]
);
