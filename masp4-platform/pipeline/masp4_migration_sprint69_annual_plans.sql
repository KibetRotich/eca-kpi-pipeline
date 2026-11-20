-- Sprint 69 — Annual Plans & Budgets library (/annual-plans)
--
-- A list of links to project and regional annual plans and budgets kept in the ECA M&E shared drive
-- (folder "ANNUAL PLANS", 19agpMTD55dXWLT5e_2gBHqzgP9QE4vQK: 01 REGIONAL ANNUAL PLANS / 02 PROJECT ANNUAL PLANS,
-- each split by year). Nothing is copied or summarised: each row is a Drive file id + link and the details used
-- for filtering and the coverage view. Budget figures are never read into the platform.
--
-- doc_kind:  plan         — workplan / annual plan
--            budget       — budget or financial plan only
--            plan_budget  — one file that holds both (listed under Plans AND Budgets)
--            supporting   — targets annexes, KPI lists, feedback memos (listed under Plans, not counted in coverage)
-- status:    final | draft. Drafts are registered only for a programme-year that has no final of that kind.
-- scope:     project (02 PROJECT ANNUAL PLANS) | regional (01 REGIONAL ANNUAL PLANS)
--
-- Rows come from a reviewed bulk load (pipeline/masp4_data_<date>_annual_plans.sql) and from staff through
-- "Add Plan" / "Add Budget" (POST /api/annual-plans). RLS is on with no policies: only the service role
-- (server code via supabaseAdmin) reads or writes. All signed-in staff see every row, budgets included.

create table if not exists public.annual_plans (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 3 and 300),
  scope          text not null check (scope in ('project', 'regional')),
  doc_kind       text not null check (doc_kind in ('plan', 'budget', 'plan_budget', 'supporting')),
  status         text not null default 'final' check (status in ('final', 'draft')),
  programme      text not null,
  project_id     uuid references public.projects(id) on delete set null,
  country        text not null check (country in ('Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Regional (ECA)')),
  plan_year      int  not null check (plan_year between 2015 and 2100),
  period_label   text,                       -- e.g. 'Jul–Dec 2018', '2026 + Q1 2027'; null = the calendar year
  drive_file_id  text not null unique,
  source_url     text not null,
  file_type      text not null check (file_type in ('pdf', 'docx', 'doc', 'xlsx', 'xls', 'xlsm', 'pptx', 'gdoc', 'gsheet', 'gslides')),
  drive_path     text,                       -- folder path in ANNUAL PLANS when loaded in bulk (for reference)
  added_by       text,
  added_at       timestamptz not null default now()
);

create index if not exists annual_plans_year_idx on public.annual_plans (plan_year desc);
create index if not exists annual_plans_programme_idx on public.annual_plans (scope, programme);

alter table public.annual_plans enable row level security;
revoke all on public.annual_plans from anon, authenticated;
