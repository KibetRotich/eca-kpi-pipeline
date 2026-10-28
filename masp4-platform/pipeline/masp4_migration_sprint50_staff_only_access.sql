-- =============================================================
-- MASP IV Sprint 50 — staff-only access to the database (pairs with proxy.ts in the app)
-- User decision (2026-10-28): nothing on the platform is public; every @solidaridadnetwork.org
-- account may view.
--
-- Before this sprint the browser (anon) key, which is visible in the site's JavaScript, could read
-- ~35 tables (incl. raw Kobo submissions for CVA / HCS / VSLA) and ~75 views directly from the
-- Supabase REST API, and any signed-in account could insert / update / delete the CVA, HCS and
-- VSLA tables. After it:
--   * anon has no privileges on anything in schema public (tables, views, sequences, the
--     eca_farmer_depth RPC), now or for objects created later;
--   * the open policies ("true" / "auth.uid() IS NOT NULL") are narrowed to public.is_staff();
--   * role-based policies (current_user_role(), user_roles) are left as they are.
-- The ETL pipelines and the app's server code use the service role, which bypasses RLS, so they are
-- unaffected. Sign-up itself is already limited to the staff domain by the
-- enforce_auth_email_domain triggers on auth.users.
--
-- Apply AFTER the app release that moves lib/eca-events/queries.ts to the server-side client,
-- otherwise /eca-events breaks until that release is live. Re-runnable.
-- =============================================================

-- 1. Who counts as staff: a signed-in user whose JWT email is on the staff domain
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.role() = 'authenticated' AND public.is_allowed_auth_email(auth.jwt() ->> 'email')
$$;
REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, service_role;

-- 2. Narrow the open policies to staff
DO $$
DECLARE
  r record;
  open_expr constant text[] := ARRAY['true', '(auth.uid() IS NOT NULL)'];
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND (qual = ANY (open_expr) OR with_check = ANY (open_expr))
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated%s%s',
      r.policyname, r.tablename,
      CASE WHEN r.qual       = ANY (open_expr) THEN ' USING (public.is_staff())'      ELSE '' END,
      CASE WHEN r.with_check = ANY (open_expr) THEN ' WITH CHECK (public.is_staff())' ELSE '' END);
  END LOOP;
END $$;

-- 3. anon gets nothing in schema public (views without security_invoker bypass RLS, so the grant
--    itself has to go)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON FUNCTION public.eca_farmer_depth(text, text, text, text, text, text, text, date, date, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.eca_farmer_depth(text, text, text, text, text, text, text, date, date, boolean) TO authenticated, service_role;

-- ...and for objects created later by the migration role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 4. Check (expect 0 rows each)
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND has_table_privilege('anon', c.oid, 'SELECT');
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
--   AND (qual IN ('true','(auth.uid() IS NOT NULL)') OR with_check IN ('true','(auth.uid() IS NOT NULL)'))
--   AND NOT roles && ARRAY['service_role']::name[];
