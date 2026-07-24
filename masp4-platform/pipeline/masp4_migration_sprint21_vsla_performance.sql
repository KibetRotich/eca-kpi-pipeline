-- =============================================================
-- MASP IV Sprint 21 Migration — VSLA Performance Assessment
-- Source: Kobo "VSLA PERFORMANCE ASSESSMENT TOOL" (asset ahxgJ6SKAgF2Pz5tBWC4kp)
-- Additive only. Namespaced vsla_* ; does not touch any existing table.
--
-- Grain:
--   vsla_raw_submissions = raw Kobo JSON (audit / reprocess)
--   vsla_groups          = one row per submission (group identity + geo + dates)
--   vsla_metrics         = one row per submission (all numeric/categorical facts,
--                          + derived KPIs; rate fields kept as *_raw + cleaned)
--   vsla_qualitative     = one row per (submission x free-text field), theme-tagged
--   vsla_sync_meta       = last-sync tracker (mirrors cva_sync_meta / hcs_sync_meta)
--
-- Idempotent: safe to re-run. Run in Supabase SQL Editor or via MCP.
-- =============================================================

-- ── 1. RAW landing (audit + reprocess) ───────────────────────
CREATE TABLE IF NOT EXISTS vsla_raw_submissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  form_uid      text        NOT NULL,
  kobo_id       bigint      NOT NULL,
  submitted_at  timestamptz,
  raw           jsonb       NOT NULL,
  fetched_at    timestamptz DEFAULT now(),
  UNIQUE (kobo_id)
);

-- ── 2. GROUPS (dim — one row per submission/assessment) ──────
CREATE TABLE IF NOT EXISTS vsla_groups (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  kobo_id         bigint      NOT NULL,
  uuid            text,
  submitted_at    timestamptz,
  enumerator      text,
  collection_date date,                       -- Data of the data collection
  group_name      text,
  country         text,                       -- constant 'Uganda' (form is UG/ICAM); documented
  sub_county      text,
  parish          text,
  village         text,
  formation_date  date,                       -- Date of formation / start date
  assessment_date date,                       -- Date of the assessment
  group_age_months numeric,                   -- derived: formation_date -> assessment_date
  dq_flags        text,                       -- DEFENSIVE: comma list of row issues
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (kobo_id)
);
CREATE INDEX IF NOT EXISTS vsla_grp_subcounty_idx ON vsla_groups (sub_county);
CREATE INDEX IF NOT EXISTS vsla_grp_parish_idx    ON vsla_groups (parish);
CREATE INDEX IF NOT EXISTS vsla_grp_village_idx   ON vsla_groups (village);

-- ── 3. METRICS (fact — one row per submission) ───────────────
CREATE TABLE IF NOT EXISTS vsla_metrics (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_kobo_id   bigint      NOT NULL,

  -- Membership & inclusion
  members_formation      int,                 -- Q1
  form_male              int,                  -- Q1a
  form_female            int,                  -- Q1b
  form_youth             int,                  -- Q1c
  form_pwd               int,                  -- Q1d
  members_active         int,                  -- Q2
  active_male            int,                  -- Q2a
  active_female          int,                  -- Q2b
  active_youth           int,                  -- Q2c
  active_pwd             int,                  -- Q2d
  members_dropped        int,                  -- Q3
  avg_member_age         numeric,              -- Q4
  meeting_frequency      text,                 -- Q5 (free text)
  active_participation   boolean,              -- Q6
  received_fin_training  boolean,              -- Q7
  linked_fin_institution boolean,              -- Q8

  -- Governance
  has_constitution       boolean,              -- Q9
  leadership_8_complete  boolean,              -- Q10
  positions_filled       int,                  -- Q10b
  clear_roles            boolean,              -- Q11
  roles_defined          boolean,              -- Q12
  responsibilities_understood boolean,         -- Q13
  meetings_documented    boolean,              -- Q14
  minutes_stored         boolean,              -- Q15
  women_in_leadership    boolean,              -- Q18
  women_leaders_count    int,                  -- Q18a
  youth_in_leadership    boolean,              -- Q19
  youth_leaders_count    int,                  -- Q19a
  secret_ballot          boolean,              -- Q20
  quorum_min             int,                  -- Q20a

  -- Savings & loans
  total_savings          numeric,              -- Q21
  share_value            numeric,              -- Q22
  savings_frequency      text,                 -- Q23 (select_one code decoded)
  avg_savings_per_member numeric,              -- Q24
  members_increased_savings int,               -- Q25
  members_reduced_savings   int,               -- Q26
  avg_savings_increase   numeric,              -- Q27
  total_loans_disbursed  numeric,              -- Q28
  avg_loan               numeric,              -- Q30
  repayment_rate_raw     numeric,              -- Q31 as entered
  repayment_rate         numeric,              -- Q31 cleaned/clamped 0-100 (null if implausible)
  interest_rate_raw      numeric,              -- Q33 as entered
  interest_rate          numeric,              -- Q33 cleaned/clamped 0-100
  default_rate_raw       numeric,              -- Q37 as entered
  default_rate           numeric,              -- Q37 cleaned/clamped 0-100 (e.g. 300000 -> null + flag)

  -- Social welfare fund
  has_welfare_fund       boolean,              -- Q38
  welfare_fund_total     numeric,              -- Q39
  welfare_pct_raw        numeric,              -- Q40 as entered
  welfare_pct            numeric,              -- Q40 cleaned/clamped 0-100
  welfare_frequency      text,                 -- Q41 (weekly/monthly)
  welfare_weekly         numeric,              -- Q41a
  welfare_monthly        numeric,              -- Q41b
  welfare_beneficiaries  int,                  -- Q43
  welfare_hh_eligible    int,                  -- Q45
  welfare_contrib_increased boolean,           -- Q46

  -- Outcomes & sustainability
  helped_access_financial   boolean,           -- Q47
  increased_member_savings  boolean,           -- Q48
  increased_group_savings   boolean,           -- Q49
  group_savings_increase_amt numeric,          -- Q49a
  strengthened_social       boolean,           -- Q50
  members_started_business  int,               -- Q51
  covers_operational_costs  boolean,           -- Q53
  can_operate_without_support boolean,         -- Q54
  has_growth_plan           boolean,           -- Q55
  has_sustainability_strategy boolean,         -- Q56
  ongoing_training          boolean,           -- Q57
  n_spinoff_vslas           int,               -- Q58
  has_champions             boolean,           -- Q59

  -- Institutional linkage
  govt_collaboration        boolean,           -- Q60
  benefits_pdm              boolean,           -- Q62 (Parish Development Model)
  has_bank_account          boolean,           -- Q63
  formally_registered       boolean,           -- Q64

  -- Gender / GALS
  gals_trained              boolean,           -- Q67
  collective_assets         boolean,           -- Q71
  spousal_collaboration     boolean,           -- Q72
  spousal_collab_count      int,               -- Q73a

  -- Derived KPIs (computed in transform.py — clamped/nulled defensively)
  retention_rate            numeric,           -- 100 * active / formation (<=100)
  pct_female_active         numeric,           -- 100 * active_female / active
  pct_youth_active          numeric,           -- 100 * active_youth / active
  pct_pwd_active            numeric,           -- 100 * active_pwd / active
  leadership_completeness   numeric,           -- 100 * positions_filled / 8 (100 if 8_complete)
  pct_women_leadership      numeric,           -- 100 * women_leaders_count / 8
  governance_score          numeric,           -- % of governance yes/no indicators positive
  savings_per_member_calc   numeric,           -- total_savings / members_active
  loan_to_savings_ratio     numeric,           -- total_loans_disbursed / total_savings
  self_sufficient           boolean,           -- covers_operational_costs AND can_operate_without_support

  dq_flags       text,                         -- DEFENSIVE: comma list of row issues
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (group_kobo_id)
);
CREATE INDEX IF NOT EXISTS vsla_metrics_grp_idx ON vsla_metrics (group_kobo_id);

-- ── 4. QUALITATIVE (submission x free-text field, theme-tagged) ──
CREATE TABLE IF NOT EXISTS vsla_qualitative (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  group_kobo_id  bigint  NOT NULL,
  field_name     text    NOT NULL,             -- Kobo question name
  question_label text,                         -- human question label
  theme          text    NOT NULL,             -- field-derived category (dropout, welfare_use, ...)
  tags           text,                         -- comma list of keyword sub-tags
  sensitive      boolean DEFAULT false,        -- GBV / welfare-attributable -> aggregate-only display
  response_text  text,
  UNIQUE (group_kobo_id, field_name)
);
CREATE INDEX IF NOT EXISTS vsla_qual_grp_idx   ON vsla_qualitative (group_kobo_id);
CREATE INDEX IF NOT EXISTS vsla_qual_theme_idx ON vsla_qualitative (theme);

-- ── 5. Sync tracker ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vsla_sync_meta (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at   timestamptz,
  n_groups         int,
  n_metric_rows    int,
  n_qualitative_rows int,
  notes            text
);
INSERT INTO vsla_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 6. RLS (platform convention: read-all, authed writes) ────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vsla_raw_submissions','vsla_groups','vsla_metrics',
                           'vsla_qualitative','vsla_sync_meta'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_del', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t||'_sel', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)', t||'_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() IS NOT NULL)', t||'_upd', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() IS NOT NULL)', t||'_del', t);
  END LOOP;
END $$;

-- ── 7. Analytics views ───────────────────────────────────────
-- Overview: one row per group with headline KPIs (safe: no free text)
CREATE OR REPLACE VIEW v_vsla_overview AS
SELECT
  g.kobo_id, g.group_name, g.sub_county, g.parish, g.village,
  g.formation_date, g.assessment_date, g.group_age_months,
  m.members_active, m.members_formation, m.members_dropped, m.retention_rate,
  m.active_female, m.active_youth, m.active_pwd,
  m.pct_female_active, m.pct_youth_active, m.pct_pwd_active,
  m.total_savings, m.total_loans_disbursed, m.avg_savings_per_member, m.avg_loan,
  m.repayment_rate, m.interest_rate, m.default_rate,
  m.has_welfare_fund, m.welfare_fund_total, m.welfare_pct,
  m.governance_score, m.leadership_completeness, m.pct_women_leadership,
  m.self_sufficient, m.members_started_business, m.n_spinoff_vslas,
  m.dq_flags
FROM vsla_groups g
JOIN vsla_metrics m ON m.group_kobo_id = g.kobo_id;

-- Programme totals (single-row rollup for the top KPI cards)
CREATE OR REPLACE VIEW v_vsla_programme_totals AS
SELECT
  count(*)                                     AS n_groups,
  sum(m.members_active)                        AS total_members,
  sum(m.active_female)                         AS total_female,
  sum(m.active_youth)                          AS total_youth,
  sum(m.active_pwd)                            AS total_pwd,
  sum(m.total_savings)                         AS total_savings,
  sum(m.total_loans_disbursed)                 AS total_loans,
  round(avg(m.repayment_rate)::numeric, 1)     AS avg_repayment_rate,
  round(avg(m.retention_rate)::numeric, 1)     AS avg_retention_rate,
  round(avg(m.governance_score)::numeric, 1)   AS avg_governance_score,
  count(*) FILTER (WHERE m.has_welfare_fund)   AS n_with_welfare_fund,
  count(*) FILTER (WHERE m.self_sufficient)    AS n_self_sufficient
FROM vsla_metrics m;

-- Governance compliance rates across groups
CREATE OR REPLACE VIEW v_vsla_governance AS
SELECT
  round(avg((has_constitution)::int)::numeric, 3)          AS pct_constitution,
  round(avg((leadership_8_complete)::int)::numeric, 3)     AS pct_leadership_complete,
  round(avg((clear_roles)::int)::numeric, 3)               AS pct_clear_roles,
  round(avg((roles_defined)::int)::numeric, 3)             AS pct_roles_defined,
  round(avg((responsibilities_understood)::int)::numeric, 3) AS pct_responsibilities,
  round(avg((meetings_documented)::int)::numeric, 3)       AS pct_meetings_documented,
  round(avg((minutes_stored)::int)::numeric, 3)            AS pct_minutes_stored,
  round(avg((women_in_leadership)::int)::numeric, 3)       AS pct_women_in_leadership,
  round(avg((youth_in_leadership)::int)::numeric, 3)       AS pct_youth_in_leadership,
  round(avg((secret_ballot)::int)::numeric, 3)             AS pct_secret_ballot
FROM vsla_metrics;

-- Institutional linkage rates
CREATE OR REPLACE VIEW v_vsla_linkage AS
SELECT
  round(avg((linked_fin_institution)::int)::numeric, 3)    AS pct_linked_fin_institution,
  round(avg((has_bank_account)::int)::numeric, 3)          AS pct_bank_account,
  round(avg((formally_registered)::int)::numeric, 3)       AS pct_registered,
  round(avg((govt_collaboration)::int)::numeric, 3)        AS pct_govt_collaboration,
  round(avg((benefits_pdm)::int)::numeric, 3)              AS pct_pdm
FROM vsla_metrics;

-- Qualitative theme prevalence (aggregate; excludes sensitive text bodies)
CREATE OR REPLACE VIEW v_vsla_qualitative_themes AS
SELECT
  theme,
  count(*)                              AS n_responses,
  count(DISTINCT group_kobo_id)         AS n_groups,
  bool_or(sensitive)                    AS has_sensitive
FROM vsla_qualitative
GROUP BY theme
ORDER BY n_responses DESC;

-- ── 8. Verify ────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'vsla_%' ORDER BY table_name;
