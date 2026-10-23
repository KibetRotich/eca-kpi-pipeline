-- =============================================================
-- MASP IV Sprint 49 — Thematic Insights: cross-study syntheses by theme
--
-- /thematic-insights (the nav tab that replaced "MASP III Dashboard") shows one synthesis per theme,
-- drawn from the PUBLISHED studies on /evaluation-insights. The user agreed the 8 themes on 2026-10-23.
--
-- "Synthesise themes" runs from a Claude Code session (Option C, no API key):
--   1. read every published evaluation_reports summary,
--   2. write one synthesis per theme (see lib/themes.ts ThemeSynthesis); every finding cites its source studies,
--   3. upsert it here as status 'draft' (one draft per theme; re-running replaces the draft).
-- An admin / M&E officer publishes a draft on /thematic-insights. Publishing marks the previous published
-- synthesis 'superseded', so each theme has at most one published and one draft synthesis at a time.
--
-- RLS is on with NO policies (service role only), as for evaluation_reports.
-- =============================================================

CREATE TABLE IF NOT EXISTS evaluation_themes (
  key          text PRIMARY KEY,
  title        text NOT NULL,
  description  text NOT NULL,
  sort_order   integer NOT NULL
);

INSERT INTO evaluation_themes (key, title, description, sort_order) VALUES
  ('productivity',  'Productivity & Yields',  'Yields per hectare or tree, output per worker, and adoption of good practices.', 1),
  ('incomes',       'Incomes & Livelihoods',  'Household and farm income, living income gaps, and how value is shared along the chain.', 2),
  ('inclusion',     'Social Inclusion',       'Gender, youth, women''s decision-making and gender-based violence.', 3),
  ('climate',       'Climate Resilience',     'Climate-smart practices, agroforestry, coping with shocks and environmental practices.', 4),
  ('markets',       'Market Access',          'Prices, buyers, traceability, certification and organised selling.', 5),
  ('finance',       'Access to Finance',      'Credit, savings groups (VSLAs), savings and input finance.', 6),
  ('decent_work',   'Decent Work',            'Working conditions, health and safety, wages and child labour.', 7),
  ('food_security', 'Food Security',          'Months of hunger, dietary diversity and household food availability.', 8)
ON CONFLICT (key) DO UPDATE
  SET title = EXCLUDED.title, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS theme_insights (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_key          text NOT NULL REFERENCES evaluation_themes(key) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded', 'rejected')),
  synthesis          jsonb NOT NULL,          -- see lib/themes.ts ThemeSynthesis
  evidence_rating    text NOT NULL CHECK (evidence_rating IN ('strong', 'moderate', 'limited')),
  source_report_ids  uuid[] NOT NULL DEFAULT '{}',
  review_note        text,                    -- points the reviewer should check
  model              text,
  generated_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_by        text,
  reviewed_at        timestamptz,
  published_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS theme_insights_one_draft     ON theme_insights (theme_key) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS theme_insights_one_published ON theme_insights (theme_key) WHERE status = 'published';

ALTER TABLE evaluation_themes ENABLE ROW LEVEL SECURITY;   -- no policies: service role only
ALTER TABLE theme_insights    ENABLE ROW LEVEL SECURITY;

-- Publishes a draft and supersedes the theme's previous published synthesis in one transaction.
-- Returns false when the row is not (or no longer) a draft. Called by /api/themes/<id>/review.
CREATE OR REPLACE FUNCTION publish_theme_insight(p_id uuid, p_reviewer text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_theme text;
BEGIN
  SELECT theme_key INTO v_theme FROM theme_insights WHERE id = p_id AND status = 'draft' FOR UPDATE;
  IF v_theme IS NULL THEN
    RETURN false;
  END IF;
  UPDATE theme_insights SET status = 'superseded', updated_at = now()
   WHERE theme_key = v_theme AND status = 'published';
  UPDATE theme_insights
     SET status = 'published', reviewed_by = p_reviewer, reviewed_at = now(), published_at = now(), updated_at = now()
   WHERE id = p_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION publish_theme_insight(uuid, text) FROM PUBLIC, anon, authenticated;
