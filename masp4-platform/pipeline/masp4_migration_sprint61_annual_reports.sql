-- Sprint 61 — Annual Reports library (/annual-reports)
--
-- A plain list of links to donor and country annual reports kept in the ECA M&E shared drive
-- (folder "ANNUAL REPORTS", 1eFqGyfTO5k09be4aFBWBRFv5yDHdHpZq). Nothing is summarised and nothing is
-- copied: each row is a Drive file id + link and the details used for filtering.
--
-- Rows were bulk-loaded from Claude Code on 2026-11-03 (68 reports, added_by 'bulk load …') and are added one at a time
-- by any signed-in staff member through "Add Report" (POST /api/annual-reports).
-- RLS is on with no policies: only the service role (server code via supabaseAdmin) reads or writes.

create table if not exists public.annual_reports (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(title) between 3 and 300),
  report_type    text not null check (report_type in ('donor', 'country')),
  programme      text not null,
  project_id     uuid references public.projects(id) on delete set null,
  country        text not null check (country in ('Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Regional (ECA)')),
  year           int  not null check (year between 2015 and 2100),
  period_label   text,                       -- e.g. 'Jan–Jun 2024' for a biannual report; null = calendar year
  drive_file_id  text not null unique,
  source_url     text not null,
  file_type      text not null check (file_type in ('pdf', 'docx', 'gdoc')),
  added_by       text,
  added_at       timestamptz not null default now()
);

create index if not exists annual_reports_year_idx on public.annual_reports (year desc);

alter table public.annual_reports enable row level security;
revoke all on public.annual_reports from anon, authenticated;
