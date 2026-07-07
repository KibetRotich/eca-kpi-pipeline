-- =============================================================
-- MASP IV Sprint 14 — Auth hardening + 500 "unexpected_failure" fix
--
-- CONTEXT
--   An M&E Officer (secilia.charles@solidaridadnetwork.org) gets a 500 on login:
--     {"code":500,"error_code":"unexpected_failure",
--      "msg":"Unexpected failure, please check server logs for more information"}
--
--   That error shape is produced by the Supabase **GoTrue auth server**, NOT by
--   any Next.js route in this repo (every app-side role path falls back to
--   'viewer' on error and the dashboard renders identically for all roles).
--   GoTrue returns `unexpected_failure` when a Postgres TRIGGER or AUTH HOOK
--   raises an exception during the auth transaction, forcing a rollback.
--
--   Two candidate causes — run §0 DIAGNOSTICS first to tell them apart:
--     (A) FIRST login  → AFTER INSERT trigger `handle_new_user` raises.
--     (B) RETURNING user → a custom access token hook (or other auth hook)
--                          raises on every login/refresh. (See §4 note.)
--
--   Run §0 (read-only), then §1–§3 (safe, idempotent), then §4 if returning.
--   Run the FULL §1–§3 block in the Supabase SQL Editor.
-- =============================================================


-- =============================================================
-- §0. DIAGNOSTICS  (read-only — run these first, paste results back)
-- =============================================================

-- 0a. Does Secilia already have an auth.users row and a user_roles row?
--     • auth row present + user_roles row present  → she is a RETURNING user
--       → the INSERT trigger does NOT fire on her logins → cause is (B), see §4.
--     • auth row present + NO user_roles row        → trigger likely failed mid-insert.
--     • NO auth row at all                          → she has never completed login
--       → this is a FIRST-login failure → cause is (A), the trigger.
SELECT u.id            AS auth_user_id,
       u.email,
       u.created_at    AS auth_created,
       u.last_sign_in_at,
       r.role,
       r.updated_at    AS role_updated
FROM auth.users u
LEFT JOIN public.user_roles r ON r.id = u.id
WHERE u.email = 'secilia.charles@solidaridadnetwork.org';

-- 0b. Is the deployed trigger/function the SAME as the repo migration?
--     (Schema drift is a common reason the code "looks fine" but prod fails.)
SELECT p.proname,
       p.prosecdef                       AS is_security_definer,
       pg_get_function_identity_arguments(p.oid) AS args,
       r.rolname                         AS owner,
       r.rolbypassrls                    AS owner_bypasses_rls,
       p.proconfig                       AS settings   -- look for search_path here
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname = 'handle_new_user';

-- 0c. Current RLS policies on user_roles (privilege-escalation check, see §3).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'user_roles';


-- =============================================================
-- §1. Harden handle_new_user so a trigger error can NEVER block auth
--     • SET search_path = public  → immune to Supabase's hardened (empty)
--       search_path on SECURITY DEFINER functions.
--     • EXCEPTION WHEN OTHERS     → a failed role insert degrades gracefully
--       (auth still succeeds; user defaults to 'viewer' via /api/me fallback)
--       instead of rolling back the whole login → no more 500 on first login.
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (id, role, email, display_name)
  VALUES (
    NEW.id,
    'viewer',
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let role bookkeeping break authentication.
    RAISE WARNING 'handle_new_user failed for % (%): %', NEW.email, NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================
-- §2. Backfill: ensure every existing auth user has a user_roles row
--     (covers anyone whose trigger silently failed before this fix).
-- =============================================================
INSERT INTO public.user_roles (id, role, email, display_name)
SELECT u.id, 'viewer', u.email, u.raw_user_meta_data->>'full_name'
FROM auth.users u
LEFT JOIN public.user_roles r ON r.id = u.id
WHERE r.id IS NULL
ON CONFLICT (id) DO NOTHING;


-- =============================================================
-- §3. SECURITY FIX (separate from the 500): privilege escalation
--     The old policy `service_role_all ... FOR ALL USING (true)` had NO
--     `TO service_role` clause, so it applied to EVERY role — any logged-in
--     user could UPDATE their own row to role='admin'. Restrict it to the
--     service_role, and keep a SELECT-own policy for /api/me's own-row reads.
--     (supabaseAdmin uses the service_role key, so server APIs are unaffected.)
-- =============================================================
DROP POLICY IF EXISTS users_read_own_role ON public.user_roles;
DROP POLICY IF EXISTS admins_write_all    ON public.user_roles;
DROP POLICY IF EXISTS service_role_all    ON public.user_roles;

-- A user may read ONLY their own role row.
CREATE POLICY users_read_own_role ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- The service role (server-side supabaseAdmin) does everything.
CREATE POLICY service_role_all ON public.user_roles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- =============================================================
-- §4. RETURNING-USER branch (cause B): auth hooks
--     If §0a shows Secilia is a returning user, the INSERT trigger is NOT the
--     cause. Check for a custom access token hook that raises on every
--     login/refresh:
--       Supabase Dashboard → Authentication → Hooks
--     If a "Custom Access Token" hook points at e.g.
--     public.custom_access_token_hook, inspect that function for an unhandled
--     exception (bad cast, missing row, null deref). Harden it the same way as
--     §1 (SET search_path + EXCEPTION WHEN OTHERS → RETURN event unchanged),
--     or temporarily disable the hook to confirm it is the culprit.
--
--     List candidate hook functions:
SELECT n.nspname AS schema, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%token%hook%' OR p.proname ILIKE '%access_token%';


-- =============================================================
-- §5. (Re)assign Secilia's M&E Officer role — safe to re-run.
--     Runs only if her auth.users row exists; no-op otherwise.
-- =============================================================
INSERT INTO public.user_roles (id, role, email, display_name)
SELECT id, 'me_officer', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'secilia.charles@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'me_officer', email = EXCLUDED.email;


-- =============================================================
-- §6. Verify final state — should show secilia as me_officer.
-- =============================================================
SELECT email, role, display_name, updated_at
FROM public.user_roles
ORDER BY role, email;
