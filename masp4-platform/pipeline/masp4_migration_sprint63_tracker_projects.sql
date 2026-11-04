-- Sprint 63 — link tracker rows to Projects' Progress projects
--
-- A new reporting cycle is now generated from the projects shown in Projects' Progress (projects.active = true):
-- one row per project. report_tracker.project_ids links a row to its project(s) — a 2025 row such as
-- "P2P Coffee" covers two projects (Kenya and Tanzania) — so a new cycle can carry over each project's
-- responsible staff from the previous cycle. Rows not tied to a project (e.g. the Internal REC report) keep '{}'.

alter table public.report_tracker add column if not exists project_ids uuid[] not null default '{}';

-- Backfill the 2025 cycle imported from the Google Doc (matched by project code).
update public.report_tracker t
set project_ids = (select coalesce(array_agg(p.id order by p.project_code), '{}') from public.projects p where p.project_code = any(m.codes))
from (values
  ('P2P Coffee',                    array['KE-P2P-001', 'TZ-P2P-001']),
  ('P2P Gold',                      array['KE-P2G-001', 'TZ-P2G-001']),
  ('Acting Now (Kenya, Ethiopia)',  array['ET-ANE-001', 'KE-ANK-001']),
  ('NPL',                           array['KE-DFN-001', 'UG-DFN-001']),
  ('CSV Maize',                     array['KE-CSV-001']),
  ('Shade for Vegetables',          array['KE-SVP-001']),
  ('AFR100',                        array['UG-AFR-001']),
  ('NOPP-Palm Oil Uganda',          array['UG-NOP-001']),
  ('Harvest Carbon',                array['UG-HAR-001']),
  ('FAO: Root Causes of Child Labour', array['UG-RCL-001']),
  ('FVO: Sustainable Cocoa',        array['UG-FVO-001']),
  ('Starbucks Uganda',              array['UG-STB-001']),
  ('P4G',                           array['KE-SYN-001']),
  ('BASF/CROS+ Baseline Report, Progress Report', array['ET-CSL-001'])
) as m(project, codes)
where t.project = m.project
  and t.cycle_id = (select id from public.report_cycles where name = '2025 Annual Reports');
