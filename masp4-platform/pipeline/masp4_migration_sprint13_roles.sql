-- =============================================================
-- MASP IV Sprint 13 - Role-based access setup
-- Run the FULL script in Supabase SQL Editor
-- =============================================================

-- 1. Create user_roles table (safe to re-run)
CREATE TABLE IF NOT EXISTS user_roles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'viewer'
                           CHECK (role IN ('admin','me_officer','viewer')),
  email        text,
  display_name text,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies (drop and recreate to avoid conflicts)
DROP POLICY IF EXISTS users_read_own_role ON user_roles;
DROP POLICY IF EXISTS admins_write_all    ON user_roles;
DROP POLICY IF EXISTS service_role_all   ON user_roles;

-- Everyone can read their own row (needed by /api/me)
CREATE POLICY users_read_own_role ON user_roles
  FOR SELECT USING (auth.uid() = id);

-- Service role (used by supabaseAdmin in /api/me) can read all rows
CREATE POLICY service_role_all ON user_roles
  FOR ALL USING (true);

-- 3. Auto-create viewer row whenever a new user signs in with Google
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- 4. Assign roles for named users
--    Run AFTER each person has logged in at least once
--    (login creates their row in auth.users first)
-- =============================================================

-- Geoffrey Rotich -> Admin
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'admin', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'geoffrey.rotich@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'admin', email = EXCLUDED.email;

-- Austine Ochieng -> M&E Officer
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'me_officer', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'austine.ochieng@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'me_officer', email = EXCLUDED.email;

-- Secilia Charles -> M&E Officer
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'me_officer', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'secilia.charles@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'me_officer', email = EXCLUDED.email;

-- Joan Chepkwemboi -> M&E Officer
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'me_officer', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'joan.chepkwemboi@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'me_officer', email = EXCLUDED.email;

-- Carolyne Mbithe -> M&E Officer
INSERT INTO user_roles (id, role, email, display_name)
SELECT id, 'me_officer', email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'carolyne.mbithe@solidaridadnetwork.org'
ON CONFLICT (id) DO UPDATE SET role = 'me_officer', email = EXCLUDED.email;

-- 5. Verify - should show 5 rows with correct roles
SELECT email, role, display_name FROM user_roles ORDER BY role;
