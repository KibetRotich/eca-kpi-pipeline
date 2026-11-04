-- Sprint 64 — staff directory for the report tracker's "Responsible" picker
--
-- /api/staff-directory lists @solidaridadnetwork.org staff for the dropdown: everyone in this table plus everyone
-- who has signed in to the platform (auth.users, read at request time, so new sign-ins appear automatically).
-- A new address typed into the picker is saved here when the tracker row is saved.
-- RLS on with no policies: only the service role (server code via supabaseAdmin) reads or writes.

create table if not exists public.staff_directory (
  email       text primary key check (email = lower(email) and email like '%@solidaridadnetwork.org'),
  name        text not null,
  source      text not null default 'manual',   -- 'tracker' (seeded from tracker rows) | 'manual' (typed into the picker)
  added_by    text,
  created_at  timestamptz not null default now()
);

alter table public.staff_directory enable row level security;
revoke all on public.staff_directory from anon, authenticated;

-- Seed: everyone already named (with an email) in the report tracker.
insert into public.staff_directory (email, name, source, added_by)
select distinct on (lower(e.email)) lower(e.email), e.name, 'tracker', 'Sprint 64 seed'
from public.report_tracker t,
     unnest(t.responsible_emails, t.responsible_names) as e(email, name)
where e.email <> '' and e.email like '%@solidaridadnetwork.org'
on conflict (email) do nothing;
