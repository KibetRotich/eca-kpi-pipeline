-- Sprint 62 — Annual report tracker (/annual-reports, "Tracker" tab)
--
-- Replaces the Google Doc "PROJECT REPORTING TRACKER". One cycle per reporting year (annual reports only);
-- one row per project report with its responsible staff, three deadlines and a status. When a report is
-- marked "Final filed", its Drive link is added to annual_reports (the Library tab) and linked here.
--
-- Who can change what (enforced in /api/report-tracker):
--   * M&E Officers / Admins: create cycles and rows, edit every field, delete rows.
--   * A responsible staff member (their email in responsible_emails): update status, note and final report on own rows.
-- Every change is written to report_tracker_log.
-- RLS on with no policies: only the service role (server code via supabaseAdmin) reads or writes.

create table if not exists public.report_cycles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                       -- e.g. '2025 Annual Reports'
  year        int  not null check (year between 2015 and 2100),
  created_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.report_tracker (
  id                  uuid primary key default gen_random_uuid(),
  cycle_id            uuid not null references public.report_cycles(id) on delete cascade,
  project             text not null check (char_length(project) between 2 and 200),   -- "Project & Template"
  report_type         text not null default 'donor' check (report_type in ('donor', 'country')),
  country             text check (country in ('Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Regional (ECA)')),
  responsible_names   text[] not null default '{}',
  responsible_emails  text[] not null default '{}',
  deadline_cm         date,          -- internal deadline to CM & Sylvia
  deadline_hop        date,          -- internal deadline to HoP
  deadline_donor      date,          -- deadline to donor
  status              text not null default 'not_started'
                      check (status in ('not_started', 'drafting', 'with_cm', 'with_hop', 'submitted', 'final_filed')),
  annual_report_ids   uuid[] not null default '{}',   -- final reports in annual_reports (Library)
  note                text,
  sort_order          int not null default 0,
  updated_by          text,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists report_tracker_cycle_idx on public.report_tracker (cycle_id, sort_order);

create table if not exists public.report_tracker_log (
  id          bigint generated always as identity primary key,
  tracker_id  uuid not null references public.report_tracker(id) on delete cascade,
  changed_by  text not null,
  changed_at  timestamptz not null default now(),
  changes     jsonb not null        -- { field: [old, new], ... }
);
create index if not exists report_tracker_log_idx on public.report_tracker_log (tracker_id, changed_at desc);

alter table public.report_cycles      enable row level security;
alter table public.report_tracker     enable row level security;
alter table public.report_tracker_log enable row level security;
revoke all on public.report_cycles, public.report_tracker, public.report_tracker_log from anon, authenticated;
