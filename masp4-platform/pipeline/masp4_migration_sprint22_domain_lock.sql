-- =============================================================
-- MASP IV Sprint 22 — lock authentication to @solidaridadnetwork.org
--
-- Backstop for the application-layer guards (proxy.ts, lib/allowed-domain.ts,
-- lib/require-org-session.ts, lib/require-editor.ts). This one is enforced by
-- Postgres, so it holds even if the app is bypassed entirely or a service-role
-- key is used to call auth.admin.createUser().
--
-- Run the FULL script in the Supabase SQL Editor.
--
-- SAFETY NOTES
--   * The INSERT trigger only fires on NEW account creation. Existing users
--     signing in perform an UPDATE of last_sign_in_at and are unaffected, so
--     applying this cannot lock out anyone who already has an account.
--   * A rejected sign-up surfaces to the user as a GoTrue 500
--     "unexpected_failure" / server_error on /auth/callback. The friendly
--     message comes from the app layer; this is the hard stop behind it.
--   * Section 4 only REPORTS out-of-domain accounts. It deletes nothing.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Domain predicate — exact match, immune to lookalike suffixes
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_allowed_auth_email(candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  allowed_domain constant text := 'solidaridadnetwork.org';
  value text := lower(btrim(coalesce(candidate, '')));
BEGIN
  IF value = '' THEN
    RETURN false;
  END IF;

  -- Exactly one '@'. Blocks 'a@solidaridadnetwork.org@evil.com', where
  -- split_part() alone would read the allowed domain out of the middle.
  IF length(value) - length(replace(value, '@', '')) <> 1 THEN
    RETURN false;
  END IF;

  -- Non-empty local part.
  IF split_part(value, '@', 1) = '' THEN
    RETURN false;
  END IF;

  -- Exact domain equality — NOT 'like %domain', which would accept
  -- 'solidaridadnetwork.org.evil.com' and 'notsolidaridadnetwork.org'.
  RETURN split_part(value, '@', 2) = allowed_domain;
END;
$$;

-- -------------------------------------------------------------
-- 2. Reject out-of-domain accounts at creation, and on email change
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_auth_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_allowed_auth_email(NEW.email) THEN
    RAISE WARNING '[auth][domain-rejected] blocked account for %', coalesce(NEW.email, '<null>');
    RAISE EXCEPTION 'Sign-in is restricted to @solidaridadnetwork.org accounts'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_auth_email_domain_insert ON auth.users;
CREATE TRIGGER enforce_auth_email_domain_insert
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_auth_email_domain();

-- Also block moving an existing account onto an outside address. Guarded by
-- IS DISTINCT FROM so ordinary sign-in updates never reach the function.
DROP TRIGGER IF EXISTS enforce_auth_email_domain_update ON auth.users;
CREATE TRIGGER enforce_auth_email_domain_update
  BEFORE UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION public.enforce_auth_email_domain();

-- -------------------------------------------------------------
-- 3. Re-assert the hardened handle_new_user (Sprint 14) and add a
--    defence-in-depth domain check to role provisioning.
--    Sprint 14's file is absent from pipeline/, so a rebuild from this
--    directory would otherwise reintroduce the login-500 bug.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Never provision a role for an account outside the allowed domain.
  IF NOT public.is_allowed_auth_email(NEW.email) THEN
    RAISE WARNING '[auth][domain-rejected] skipped role provisioning for %', coalesce(NEW.email, '<null>');
    RETURN NEW;
  END IF;

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
    -- Role bookkeeping must never break authentication.
    RAISE WARNING 'handle_new_user failed for % (%): %', NEW.email, NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------------
-- 4. AUDIT ONLY — report pre-existing out-of-domain accounts.
--    Review the output manually. Nothing is deleted or disabled here.
-- -------------------------------------------------------------
SELECT
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  r.role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.id = u.id
WHERE NOT public.is_allowed_auth_email(u.email)
ORDER BY u.created_at;

-- -------------------------------------------------------------
-- 5. Verify the predicate behaves as intended (all rows should read 'PASS')
-- -------------------------------------------------------------
WITH cases(candidate, expected) AS (
  VALUES
    ('geoffrey.rotich@solidaridadnetwork.org',        true),
    ('Geoffrey.Rotich@SolidaridadNetwork.ORG',        true),
    ('  spaced@solidaridadnetwork.org  ',             true),
    ('someone@gmail.com',                             false),
    ('someone@solidaridadnetwork.org.evil.com',       false),
    ('someone@notsolidaridadnetwork.org',             false),
    ('someone@sub.solidaridadnetwork.org',            false),
    ('a@solidaridadnetwork.org@evil.com',             false),
    ('@solidaridadnetwork.org',                       false),
    ('no-at-sign',                                    false),
    (NULL,                                            false)
)
SELECT
  coalesce(candidate, '<null>') AS candidate,
  expected,
  public.is_allowed_auth_email(candidate) AS actual,
  CASE WHEN public.is_allowed_auth_email(candidate) = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM cases;
