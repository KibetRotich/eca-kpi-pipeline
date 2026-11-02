-- Sprint 59: close the "signed-in user reads the database API directly" route (applied 2026-11-02, after the
-- /api/eca-events/export deploy). Fixes the Supabase security advisor findings below.
--
-- 1. SECURITY DEFINER views (security_definer_view, 41 views): they bypass RLS, so any `authenticated` JWT could read
--    them through /rest/v1. They stay definer (the *_safe views exist to hide PII columns of the raw tables) but are
--    no longer granted to anon/authenticated. The app reads them server-side with the service role; the one browser
--    read (ECA Events CSV export) now goes through /api/eca-events/export.
--    NOTE: Supabase's default privileges grant NEW views to authenticated — revoke on any new definer view too.
-- 2. SECURITY DEFINER functions callable over RPC (anon/authenticated_security_definer_function_executable):
--    eca_farmer_depth is called server-side only; handle_new_user and enforce_auth_email_domain are trigger functions
--    (triggers do not need EXECUTE at fire time).
-- 3. function_search_path_mutable: pin search_path on 4 functions (they only use public objects and auth.*).
-- The old personal Gmail account (created 2026-07-27, before the staff-only gate) was deleted the same day.

do $$
declare v record;
begin
  for v in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce((select bool_or(o in ('security_invoker=true', 'security_invoker=on')) from unnest(c.reloptions) o), false)
  loop
    execute format('revoke all on %s from anon, authenticated', v.rel);
  end loop;
end $$;

revoke execute on function public.eca_farmer_depth(text, text, text, text, text, text, text, date, date, boolean)
  from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_auth_email_domain() from public, anon, authenticated;
-- Belt and braces for sign-in: the Auth service (not exposed through /rest/v1) keeps EXECUTE on the trigger functions.
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.enforce_auth_email_domain() to supabase_auth_admin;

alter function public.set_updated_at() set search_path = public;
alter function public.lock_baseline_on_approve() set search_path = public;
alter function public.current_user_role() set search_path = public;
alter function public.current_user_country() set search_path = public;
