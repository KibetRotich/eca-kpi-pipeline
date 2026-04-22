-- ============================================================================
-- MASP IV Tier 2 Platform — Database Schema  (Sprint 1)
-- ============================================================================
-- Platform   : PostgreSQL via Supabase
-- Programme  : Solidaridad MASP IV
-- Countries  : Kenya, Uganda, Tanzania, Ethiopia
-- KPIs       : S6.1, S6.2, S2.1, S2.5, S6.3, S6.4, S6.5  (S1.2 excluded)
-- Data entry : ODK/Taro → import/approval layer → this schema
-- Generated  : 2026-04-08
-- ============================================================================

-- ── EXTENSIONS ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM TYPES ────────────────────────────────────────────────────────────────
CREATE TYPE country_enum   AS ENUM ('Kenya','Uganda','Tanzania','Ethiopia');
CREATE TYPE commodity_enum AS ENUM ('Coffee','Tea','F&V','Gold','Dairy','Leather','Cotton','Fashion','Palm Oil','Cocoa');
CREATE TYPE gender_enum    AS ENUM ('Male','Female','Other');
CREATE TYPE submission_status AS ENUM ('pending','approved','rejected','needs_review');
CREATE TYPE tier_enum      AS ENUM ('Tier 1','Tier 2','Tier 3');
CREATE TYPE significance_enum AS ENUM ('Low','Medium','High');
CREATE TYPE user_role AS ENUM ('admin','country_manager','data_officer','viewer');


-- ── REFERENCE: PROJECTS ───────────────────────────────────────────────────────
-- A project is the funded programme unit within a country + commodity.
-- All survey records link back to a project.

CREATE TABLE projects (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_code  TEXT NOT NULL UNIQUE,   -- e.g. 'KE-COF-001'
    project_name  TEXT NOT NULL,
    country       country_enum NOT NULL,
    commodity     commodity_enum NOT NULL,
    start_year    SMALLINT,
    end_year      SMALLINT,
    active        BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ── PLATFORM USERS ────────────────────────────────────────────────────────────
-- Staff who use the web import/approval/dashboard layer.
-- id must match Supabase auth.uid() for RLS to work.

CREATE TABLE platform_users (
    id          UUID PRIMARY KEY,               -- must equal auth.uid()
    email       TEXT NOT NULL UNIQUE,
    full_name   TEXT,
    role        user_role NOT NULL DEFAULT 'viewer',
    country     country_enum,                   -- NULL = access to all countries
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    last_login  TIMESTAMPTZ
);


-- ── ODK SUBMISSION STAGING ────────────────────────────────────────────────────
-- Raw ODK/Taro exports land here before a data officer reviews and approves.
-- Approved submissions trigger record creation in the normalised tables.

CREATE TABLE odk_submissions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_uuid  TEXT NOT NULL UNIQUE,   -- UUID stamped by ODK/Taro on device
    form_id          TEXT NOT NULL,          -- 'FarmerProfile','S61','S62', etc.
    project_id       UUID REFERENCES projects(id),
    country          country_enum,
    submitted_at     TIMESTAMPTZ NOT NULL,
    imported_at      TIMESTAMPTZ DEFAULT NOW(),
    raw_data         JSONB NOT NULL,         -- full ODK submission payload
    status           submission_status DEFAULT 'pending',
    reviewed_by      UUID REFERENCES platform_users(id),
    reviewed_at      TIMESTAMPTZ,
    review_notes     TEXT,
    linked_record_id UUID                   -- FK to created record (polymorphic)
);

CREATE INDEX odk_status_idx   ON odk_submissions(status);
CREATE INDEX odk_project_idx  ON odk_submissions(project_id);
CREATE INDEX odk_form_idx     ON odk_submissions(form_id);


-- ── SERVICE PROVIDER PROFILES ─────────────────────────────────────────────────
-- Defined before farmer_profiles because s21_sp_triangulation references it.

CREATE TABLE service_provider_profiles (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    odk_submission_id UUID REFERENCES odk_submissions(id),
    project_id        UUID NOT NULL REFERENCES projects(id),
    country           country_enum NOT NULL,
    survey_year       SMALLINT NOT NULL,

    sp_name           TEXT,           -- sp_name
    is_female_owned   BOOLEAN,        -- sp_owned_female
    is_youth_owned    BOOLEAN,        -- sp_owned_youth
    sp_type           TEXT,           -- sp_type
    financial_type    TEXT,           -- sp_type_financial (conditional)
    leadership_type   TEXT,           -- sp_leadership
    year_established  SMALLINT,       -- sp_year
    total_members     INTEGER,        -- sp_members
    female_members    INTEGER,        -- sp_members_f
    male_members      INTEGER,        -- sp_members_m
    total_employees   INTEGER,        -- sp_employees
    female_employees  INTEGER,        -- sp_employees_f
    male_employees    INTEGER,        -- sp_employees_m

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX sp_project_idx ON service_provider_profiles(project_id);


-- ── FARMER / PRODUCER PROFILES ────────────────────────────────────────────────
-- Core respondent record.  All production-pathway surveys link to this table.

CREATE TABLE farmer_profiles (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    odk_submission_id UUID REFERENCES odk_submissions(id),
    project_id        UUID NOT NULL REFERENCES projects(id),
    country           country_enum NOT NULL,
    commodity         commodity_enum NOT NULL,
    survey_year       SMALLINT NOT NULL,

    -- Identity
    national_id       TEXT,           -- f_profile_id_national
    farmer_uid        TEXT,           -- f_profile_id_farmer (coop/project ID)
    full_name         TEXT,           -- f_profile_profile_name

    -- Demographics
    age               SMALLINT,       -- f_profile_age
    birth_year        SMALLINT,       -- f_profile_birth_year
    gender            gender_enum,    -- f_profile_gender
    -- is_youth: TRUE if age <= 35 (Solidaridad definition)
    is_youth          BOOLEAN GENERATED ALWAYS AS (age IS NOT NULL AND age <= 35) STORED,

    -- Socioeconomics
    education_level       TEXT,       -- f_profile_education
    has_mobile_phone      BOOLEAN,    -- f_profile_phone
    has_mobile_internet   BOOLEAN,    -- f_profile_internet
    household_size        SMALLINT,   -- f_profile_hh_size
    household_role        TEXT,       -- f_profile_household_head
    decision_maker        TEXT,       -- f_profile_decision_making

    -- Farm basics
    primary_commodity TEXT,           -- f_profile_primary_commodity
    land_type         TEXT,           -- f_profile_land_holding
    total_workers     SMALLINT,       -- f_profile_workers
    hired_workers     SMALLINT,       -- f_profile_workers_hired

    -- Baseline control
    is_baseline          BOOLEAN DEFAULT FALSE,
    baseline_locked_at   TIMESTAMPTZ,

    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate enrolment of same farmer in same project-year
CREATE UNIQUE INDEX farmer_uid_year_idx
    ON farmer_profiles(farmer_uid, project_id, survey_year)
    WHERE farmer_uid IS NOT NULL;

CREATE INDEX farmer_national_id_idx ON farmer_profiles(national_id) WHERE national_id IS NOT NULL;
CREATE INDEX farmer_project_year_idx ON farmer_profiles(project_id, survey_year);
CREATE INDEX farmer_country_year_idx ON farmer_profiles(country, survey_year);
CREATE INDEX farmer_disagg_idx ON farmer_profiles(gender, is_youth);


-- ── CSO PROFILES ──────────────────────────────────────────────────────────────

CREATE TABLE cso_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    odk_submission_id   UUID REFERENCES odk_submissions(id),
    project_id          UUID NOT NULL REFERENCES projects(id),
    country             country_enum NOT NULL,
    survey_year         SMALLINT NOT NULL,

    cso_name            TEXT NOT NULL,      -- cso_name
    cso_type            TEXT,               -- cso_type
    cso_led_groups      TEXT[],             -- cso_led (multi-select)
    advocates_for       TEXT[],             -- cso_advocates (multi-select)
    cso_country         country_enum,       -- cso_country (may differ from project country)
    scope               TEXT,               -- cso_scope
    targeted_entity     TEXT,               -- cso_target
    primary_theme       TEXT,               -- cso_theme_primary
    secondary_theme     TEXT,               -- cso_theme_secondary
    theme_narrative     TEXT,               -- cso_theme_narrative
    dialogue_description TEXT,              -- cso_theme_description

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX cso_project_idx ON cso_profiles(project_id);


-- ── COMPANY / CORPORATE PROFILES ──────────────────────────────────────────────

CREATE TABLE company_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    odk_submission_id   UUID REFERENCES odk_submissions(id),
    project_id          UUID NOT NULL REFERENCES projects(id),
    survey_year         SMALLINT NOT NULL,

    company_name        TEXT NOT NULL,      -- c_name
    hq_country          TEXT,               -- c_country
    company_type        TEXT,               -- c_type
    scope               TEXT,               -- c_scope
    commodities         TEXT[],             -- c_commodities (multi-select)
    solidaridad_support TEXT[],             -- c_support (multi-select)

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX company_project_idx ON company_profiles(project_id);


-- ── S6.1  RESILIENCE SURVEY ────────────────────────────────────────────────────
-- 7 scored sub-components → Resilience Index (0–35)
-- Threshold for counting a farmer: set by Solidaridad M&E team after baseline

CREATE TABLE s61_resilience_surveys (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id         UUID NOT NULL REFERENCES farmer_profiles(id) ON DELETE CASCADE,
    odk_submission_id UUID REFERENCES odk_submissions(id),
    project_id        UUID NOT NULL REFERENCES projects(id),
    survey_year       SMALLINT NOT NULL,

    -- Sub-component 1: Soil health (raw measurements, not scored 0-5)
    soil_test_method  TEXT,               -- f_S61_soil_test
    soil_carbon       NUMERIC(6,3),       -- f_S61_soil_C  (% C)
    soil_nitrogen     NUMERIC(6,3),       -- f_S61_soil_N  (% N)
    soil_sample_id    TEXT,               -- f_S61_soil_sampleID

    -- Sub-component 2: Membership in collectives  (0–5)
    membership_score  SMALLINT CHECK (membership_score BETWEEN 0 AND 5),

    -- Sub-component 3: Local decision making  (0–5)
    decision_score    SMALLINT CHECK (decision_score BETWEEN 0 AND 5),

    -- Sub-component 4: Ability to cover major expenses  (0–5)
    income_expenses_score SMALLINT CHECK (income_expenses_score BETWEEN 0 AND 5),

    -- Sub-component 5: Shock exposure & recovery
    shocks_experienced    TEXT[],         -- multi-select: f_S61_income_shocks
    shock_impact_score    SMALLINT CHECK (shock_impact_score BETWEEN 2 AND 3),
    shock_recovery_score  SMALLINT CHECK (shock_recovery_score BETWEEN 2 AND 5),

    -- Sub-component 6: Savings buffer  (0–5)
    savings_score     SMALLINT CHECK (savings_score BETWEEN 0 AND 5),

    -- Sub-component 7: Income source diversification  (0–5)
    income_sources_score SMALLINT CHECK (income_sources_score BETWEEN 0 AND 5),

    -- Computed: sum of scored sub-components (app layer or trigger)
    resilience_index  NUMERIC(5,2),       -- 0–35
    meets_threshold   BOOLEAN,            -- set by app after M&E team defines cut-off

    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX s61_farmer_year_idx ON s61_resilience_surveys(farmer_id, survey_year);
CREATE INDEX s61_project_year_idx ON s61_resilience_surveys(project_id, survey_year);
CREATE INDEX s61_threshold_idx ON s61_resilience_surveys(meets_threshold);


-- ── S6.2  FARM VIABILITY SURVEY ────────────────────────────────────────────────
-- 6 scored sub-components → Farm Viability Index (0–30)

CREATE TABLE s62_viability_surveys (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id         UUID NOT NULL REFERENCES farmer_profiles(id) ON DELETE CASCADE,
    odk_submission_id UUID REFERENCES odk_submissions(id),
    project_id        UUID NOT NULL REFERENCES projects(id),
    survey_year       SMALLINT NOT NULL,

    -- Sub-component 1: Yield
    seed_variety          TEXT,           -- f_S62_yield_seed
    yield_value           NUMERIC(10,3), -- f_S62_yield
    yield_unit            TEXT,           -- f_S62_yield_unit
    total_output          NUMERIC(12,3), -- f_S62_yield_output
    output_unit           TEXT,           -- f_S62_yield_output_unit
    farm_size_ha          NUMERIC(8,3),  -- f_S62_yield_farm_size
    yield_increased       BOOLEAN,        -- f_S62_yield_increase
    yield_increase_pct    NUMERIC(6,2),  -- f_S62_yield_increase_perc

    -- Sub-component 2: Income diversification  (0–5)
    income_diversification_score SMALLINT CHECK (income_diversification_score BETWEEN 0 AND 5),

    -- Sub-component 3: Income perception  (0–5)
    income_perception_score SMALLINT CHECK (income_perception_score BETWEEN 0 AND 5),

    -- Sub-component 4: Access to services
    services_accessed     TEXT[],         -- multi-select: f_S62_services
    service_quality       TEXT,           -- f_S62_services_quality

    -- Sub-component 5: Net Promoter Score for services  (1–10)
    net_promoter_score    SMALLINT CHECK (net_promoter_score BETWEEN 1 AND 10),

    -- Sub-component 6: Market access / price satisfaction  (0–5)
    market_access_score   SMALLINT CHECK (market_access_score BETWEEN 0 AND 5),

    -- Computed
    viability_index       NUMERIC(5,2),  -- 0–30
    meets_threshold       BOOLEAN,

    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX s62_farmer_year_idx ON s62_viability_surveys(farmer_id, survey_year);
CREATE INDEX s62_project_year_idx ON s62_viability_surveys(project_id, survey_year);


-- ── S2.1  SERVICES ACCESS — FARMER RESPONSES ──────────────────────────────────
-- A farmer qualifies if they received NEW or IMPROVED services from an
-- SP supported by Solidaridad.

CREATE TABLE s21_services_surveys (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id                UUID NOT NULL REFERENCES farmer_profiles(id) ON DELETE CASCADE,
    odk_submission_id        UUID REFERENCES odk_submissions(id),
    project_id               UUID NOT NULL REFERENCES projects(id),
    survey_year              SMALLINT NOT NULL,

    services_received        TEXT[],         -- f_S21_services (multi)
    service_sources          TEXT,           -- f_S21_source (free text)
    new_services_introduced  BOOLEAN,        -- f_S21_amount
    quality_change           TEXT,           -- f_S21_quality
    promoter_score           SMALLINT CHECK (promoter_score BETWEEN 1 AND 10),
    relevance_narrative      TEXT,           -- f_S21_relevance

    -- Counting rule: qualifies if at least one of new or improved is confirmed
    qualifies BOOLEAN GENERATED ALWAYS AS (
        new_services_introduced = TRUE OR quality_change = 'Quality improved'
    ) STORED,

    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX s21_farmer_year_idx ON s21_services_surveys(farmer_id, survey_year);
CREATE INDEX s21_project_year_idx ON s21_services_surveys(project_id, survey_year);


-- ── S2.1  SERVICE PROVIDER TRIANGULATION ──────────────────────────────────────
-- Cross-checks farmer-reported service uptake against SP records.

CREATE TABLE s21_sp_triangulation (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sp_profile_id        UUID NOT NULL REFERENCES service_provider_profiles(id) ON DELETE CASCADE,
    odk_submission_id    UUID REFERENCES odk_submissions(id),
    project_id           UUID NOT NULL REFERENCES projects(id),
    survey_year          SMALLINT NOT NULL,

    services_offered     TEXT[],       -- sp_S21_services
    new_services         BOOLEAN,      -- sp_S21_services_new
    improved_services    BOOLEAN,      -- sp_S21_services_improved
    farmers_total        INTEGER,      -- sp_S21_number_farmers
    farmers_male         INTEGER,      -- sp_S21_number_farmers_m
    farmers_female       INTEGER,      -- sp_S21_number_farmers_f
    farmers_youth_male   INTEGER,      -- sp_S21_number_farmers_my
    farmers_youth_female INTEGER,      -- sp_S21_number_farmers_fy

    created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX s21_sp_project_year_idx ON s21_sp_triangulation(project_id, survey_year);


-- ── S2.5  BUSINESS CO-OWNERSHIP ────────────────────────────────────────────────
-- Records individual or SP co-ownership of value-addition/service businesses
-- supported by Solidaridad.

CREATE TABLE s25_ownership_surveys (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farmer_id         UUID REFERENCES farmer_profiles(id) ON DELETE CASCADE,
    sp_profile_id     UUID REFERENCES service_provider_profiles(id) ON DELETE CASCADE,
    odk_submission_id UUID REFERENCES odk_submissions(id),
    project_id        UUID NOT NULL REFERENCES projects(id),
    survey_year       SMALLINT NOT NULL,
    respondent_type   TEXT NOT NULL CHECK (respondent_type IN ('farmer','service_provider')),

    -- Farmer-side fields
    owns_business     BOOLEAN,         -- f_S25_ownership
    ownership_pct     NUMERIC(5,2),    -- f_S25_ownership_share (%)
    business_stage    TEXT,            -- f_S25_stage
    has_investments   BOOLEAN,         -- f_S25_investments
    investment_type   TEXT,            -- f_S25_investments_type

    -- SP-side fields
    co_owners_count   INTEGER,         -- sp_S25_ownership_members
    sp_business_stage TEXT,            -- sp_S25_stage

    qualifies         BOOLEAN,         -- set manually on approval

    created_at        TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT s25_respondent_fk CHECK (
        (respondent_type = 'farmer' AND farmer_id IS NOT NULL AND sp_profile_id IS NULL) OR
        (respondent_type = 'service_provider' AND sp_profile_id IS NOT NULL AND farmer_id IS NULL)
    )
);

CREATE INDEX s25_project_year_idx ON s25_ownership_surveys(project_id, survey_year);


-- ── S6.3  GOVERNANCE / REGULATIONS & FRAMEWORKS ───────────────────────────────
-- Counts mandatory regulations and voluntary frameworks improved/established.
-- Tier 1 = pipeline (not counted); Tier 2 & Tier 3 = counted in KPI.

CREATE TABLE s63_governance_records (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cso_profile_id        UUID NOT NULL REFERENCES cso_profiles(id) ON DELETE CASCADE,
    odk_submission_id     UUID REFERENCES odk_submissions(id),
    project_id            UUID NOT NULL REFERENCES projects(id),
    survey_year           SMALLINT NOT NULL,

    targeted_entity       TEXT,                -- f_S63_entity
    regulation_type       TEXT,                -- f_S63_regulation
    mandatory_type        TEXT,                -- f_S63_regulation_mandatory (conditional)
    voluntary_type        TEXT,                -- f_S63_regulation_voluntary (conditional)
    framework_change_desc TEXT,               -- f_S63_framework_change
    progress_tier         tier_enum,          -- f_S63_framework_progress
    significance          significance_enum,  -- f_S63_framework_signifcance
    smallholders_impacted INTEGER,            -- f_S63_framework_impact

    -- Counting rule: Tier 2 and Tier 3 only
    counted_in_kpi BOOLEAN GENERATED ALWAYS AS (
        progress_tier IN ('Tier 2','Tier 3')
    ) STORED,

    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX s63_project_year_idx ON s63_governance_records(project_id, survey_year);
CREATE INDEX s63_tier_idx ON s63_governance_records(progress_tier);


-- ── S6.4  MARKET — COMPANY REWARDS TO FARMERS ────────────────────────────────
-- One record per commodity purchase event.
-- A company is counted in the KPI if directly_rewards_farmers = TRUE.

CREATE TABLE s64_market_reward_records (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_profile_id       UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
    odk_submission_id        UUID REFERENCES odk_submissions(id),
    project_id               UUID NOT NULL REFERENCES projects(id),
    survey_year              SMALLINT NOT NULL,

    commodity                TEXT,               -- f_S64_commodity
    volume_purchased         NUMERIC(14,3),      -- f_S64_volumne
    sustainability_framework TEXT,               -- f_S64_framework
    directly_rewards_farmers BOOLEAN,            -- f_S64_reward
    reward_type              TEXT[],             -- f_S64_reward_type (multi)
    reward_amount_eur        NUMERIC(14,2),      -- f_S64_reward_amount
    farmers_rewarded         INTEGER,            -- f_S64_reward_farmers

    -- Counting rule: company qualifies if it directly rewards farmers
    counted_in_kpi BOOLEAN GENERATED ALWAYS AS (
        directly_rewards_farmers IS TRUE
    ) STORED,

    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX s64_project_year_idx ON s64_market_reward_records(project_id, survey_year);


-- ── S6.5  RESPONSIBLE PROCUREMENT POLICY ─────────────────────────────────────
-- Tracks company progress on adopting/implementing responsible procurement.
-- Tier 1 = pipeline; Tier 2 = adoption (policy approved); Tier 3 = implementation.

CREATE TABLE s65_procurement_records (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_profile_id     UUID NOT NULL REFERENCES company_profiles(id) ON DELETE CASCADE,
    odk_submission_id      UUID REFERENCES odk_submissions(id),
    project_id             UUID NOT NULL REFERENCES projects(id),
    survey_year            SMALLINT NOT NULL,

    change_story           TEXT,               -- f_S65_story
    progress_tier          tier_enum,          -- f_S65_progress
    commodities_covered    TEXT[],             -- f_S65_commodity (multi)
    relevance_narrative    TEXT,               -- f_S65_relevance
    relevance_label        significance_enum,  -- f_S65_relevance_label
    contribution_narrative TEXT,               -- f_S65_contribution
    contribution_label     TEXT,               -- f_S65_contribution_label

    -- Policy checklist
    has_policy             BOOLEAN,
    has_smart_commitments  BOOLEAN,
    has_action_plan        BOOLEAN,
    countries_covered      TEXT,
    third_party_verified   BOOLEAN,

    -- Counting rule: Tier 2 and Tier 3 only
    counted_in_kpi BOOLEAN GENERATED ALWAYS AS (
        progress_tier IN ('Tier 2','Tier 3')
    ) STORED,

    created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX s65_project_year_idx ON s65_procurement_records(project_id, survey_year);


-- ── ENROLLED POPULATION PER PROJECT PER YEAR ─────────────────────────────────
-- Entered by country managers from MIS/Salesforce.
-- Drives stratified extrapolation in all farmer KPI views.

CREATE TABLE project_year_targets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    survey_year      SMALLINT NOT NULL,
    target_total   INTEGER NOT NULL CHECK (target_total > 0),
    target_female  INTEGER CHECK (target_female >= 0),
    target_male    INTEGER CHECK (target_male   >= 0),
    data_source      TEXT,    -- e.g. 'Salesforce export', 'MIS April 2026'
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (project_id, survey_year)
);

CREATE TRIGGER trg_enrollment_updated_at
    BEFORE UPDATE ON project_year_targets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE project_year_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollment_read   ON project_year_targets FOR SELECT USING (current_user_role() IS NOT NULL);
CREATE POLICY enrollment_write  ON project_year_targets FOR ALL    USING (current_user_role() IN ('admin','country_manager'));


-- ── AGGREGATED KPI VIEWS ──────────────────────────────────────────────────────
-- Stratified post-stratification estimator (stratified by gender, random sampling).
--
-- Formula per KPI for farmer-level indicators (S6.1, S6.2, S2.1):
--
--   estimated = (f_threshold / f_surveyed) × f_enrolled
--             + (m_threshold / m_surveyed) × m_enrolled
--
-- Falls back to simple ratio estimator when stratum enrolled counts are NULL:
--   estimated = (threshold / sample_size) × target_total
--
-- Youth is cross-cutting (not a separate stratum):
--   achievement_youth = (y_threshold / y_surveyed) × target_total
--
-- S2.5, S6.3, S6.4, S6.5 are NOT sample-based → no extrapolation.

-- S6.1: Farmers with enhanced resilience
CREATE VIEW v_s61_kpi AS
WITH survey AS (
    SELECT
        s.project_id,
        s.survey_year,
        COUNT(*)                                                            AS sample_size,
        COUNT(*) FILTER (WHERE s.meets_threshold)                          AS sample_count,
        COUNT(*) FILTER (WHERE fp.gender = 'Female')                       AS sample_f,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.gender = 'Female') AS sample_f_threshold,
        COUNT(*) FILTER (WHERE fp.gender = 'Male')                         AS sample_m,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.gender = 'Male')   AS sample_m_threshold,
        COUNT(*) FILTER (WHERE fp.is_youth)                                AS sample_y,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.is_youth)          AS sample_y_threshold,
        ROUND(AVG(s.resilience_index), 2)                                  AS avg_index
    FROM s61_resilience_surveys s
    JOIN farmer_profiles fp ON fp.id = s.farmer_id
    GROUP BY s.project_id, s.survey_year
)
SELECT
    s.project_id,
    s.survey_year,
    s.sample_size,
    s.sample_count,
    s.avg_index,
    e.target_total,
    e.target_female,
    e.target_male,
    ROUND(100.0 * s.sample_count / NULLIF(s.sample_size, 0), 1)  AS sample_pct,
    -- Stratified estimate (gender strata)
    CASE
        WHEN e.target_female IS NOT NULL AND e.target_male IS NOT NULL
        THEN ROUND(
            COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female
          + COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male
        )
        WHEN e.target_total IS NOT NULL
        THEN ROUND(s.sample_count::numeric / NULLIF(s.sample_size, 0) * e.target_total)
        ELSE NULL
    END AS achievement,
    CASE WHEN e.target_female IS NOT NULL
        THEN ROUND(COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female)
        ELSE NULL END AS achievement_female,
    CASE WHEN e.target_male IS NOT NULL
        THEN ROUND(COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male)
        ELSE NULL END AS achievement_male,
    CASE WHEN e.target_total IS NOT NULL
        THEN ROUND(COALESCE(s.sample_y_threshold::numeric / NULLIF(s.sample_y, 0), 0) * e.target_total)
        ELSE NULL END AS achievement_youth
FROM survey s
LEFT JOIN project_year_targets e
       ON e.project_id = s.project_id AND e.survey_year = s.survey_year;

-- S6.2: Farmers with improved farm viability
CREATE VIEW v_s62_kpi AS
WITH survey AS (
    SELECT
        s.project_id,
        s.survey_year,
        COUNT(*)                                                            AS sample_size,
        COUNT(*) FILTER (WHERE s.meets_threshold)                          AS sample_count,
        COUNT(*) FILTER (WHERE fp.gender = 'Female')                       AS sample_f,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.gender = 'Female') AS sample_f_threshold,
        COUNT(*) FILTER (WHERE fp.gender = 'Male')                         AS sample_m,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.gender = 'Male')   AS sample_m_threshold,
        COUNT(*) FILTER (WHERE fp.is_youth)                                AS sample_y,
        COUNT(*) FILTER (WHERE s.meets_threshold AND fp.is_youth)          AS sample_y_threshold,
        ROUND(AVG(s.viability_index), 2)                                   AS avg_index
    FROM s62_viability_surveys s
    JOIN farmer_profiles fp ON fp.id = s.farmer_id
    GROUP BY s.project_id, s.survey_year
)
SELECT
    s.project_id,
    s.survey_year,
    s.sample_size,
    s.sample_count,
    s.avg_index,
    e.target_total,
    e.target_female,
    e.target_male,
    ROUND(100.0 * s.sample_count / NULLIF(s.sample_size, 0), 1)  AS sample_pct,
    CASE
        WHEN e.target_female IS NOT NULL AND e.target_male IS NOT NULL
        THEN ROUND(
            COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female
          + COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male
        )
        WHEN e.target_total IS NOT NULL
        THEN ROUND(s.sample_count::numeric / NULLIF(s.sample_size, 0) * e.target_total)
        ELSE NULL
    END AS achievement,
    CASE WHEN e.target_female IS NOT NULL
        THEN ROUND(COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female)
        ELSE NULL END AS achievement_female,
    CASE WHEN e.target_male IS NOT NULL
        THEN ROUND(COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male)
        ELSE NULL END AS achievement_male,
    CASE WHEN e.target_total IS NOT NULL
        THEN ROUND(COALESCE(s.sample_y_threshold::numeric / NULLIF(s.sample_y, 0), 0) * e.target_total)
        ELSE NULL END AS achievement_youth
FROM survey s
LEFT JOIN project_year_targets e
       ON e.project_id = s.project_id AND e.survey_year = s.survey_year;

-- S2.1: Farmers accessing new/improved services
CREATE VIEW v_s21_kpi AS
WITH survey AS (
    SELECT
        s.project_id,
        s.survey_year,
        COUNT(*)                                                        AS sample_size,
        COUNT(*) FILTER (WHERE s.qualifies)                             AS sample_count,
        COUNT(*) FILTER (WHERE fp.gender = 'Female')                   AS sample_f,
        COUNT(*) FILTER (WHERE s.qualifies AND fp.gender = 'Female')   AS sample_f_threshold,
        COUNT(*) FILTER (WHERE fp.gender = 'Male')                     AS sample_m,
        COUNT(*) FILTER (WHERE s.qualifies AND fp.gender = 'Male')     AS sample_m_threshold,
        COUNT(*) FILTER (WHERE fp.is_youth)                            AS sample_y,
        COUNT(*) FILTER (WHERE s.qualifies AND fp.is_youth)            AS sample_y_threshold
    FROM s21_services_surveys s
    JOIN farmer_profiles fp ON fp.id = s.farmer_id
    GROUP BY s.project_id, s.survey_year
)
SELECT
    s.project_id,
    s.survey_year,
    s.sample_size,
    s.sample_count,
    e.target_total,
    e.target_female,
    e.target_male,
    ROUND(100.0 * s.sample_count / NULLIF(s.sample_size, 0), 1)  AS sample_pct,
    CASE
        WHEN e.target_female IS NOT NULL AND e.target_male IS NOT NULL
        THEN ROUND(
            COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female
          + COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male
        )
        WHEN e.target_total IS NOT NULL
        THEN ROUND(s.sample_count::numeric / NULLIF(s.sample_size, 0) * e.target_total)
        ELSE NULL
    END AS achievement,
    CASE WHEN e.target_female IS NOT NULL
        THEN ROUND(COALESCE(s.sample_f_threshold::numeric / NULLIF(s.sample_f, 0), 0) * e.target_female)
        ELSE NULL END AS achievement_female,
    CASE WHEN e.target_male IS NOT NULL
        THEN ROUND(COALESCE(s.sample_m_threshold::numeric / NULLIF(s.sample_m, 0), 0) * e.target_male)
        ELSE NULL END AS achievement_male,
    CASE WHEN e.target_total IS NOT NULL
        THEN ROUND(COALESCE(s.sample_y_threshold::numeric / NULLIF(s.sample_y, 0), 0) * e.target_total)
        ELSE NULL END AS achievement_youth
FROM survey s
LEFT JOIN project_year_targets e
       ON e.project_id = s.project_id AND e.survey_year = s.survey_year;

-- S2.5: Individuals co-owning businesses (counted after manual approval)
CREATE VIEW v_s25_kpi AS
SELECT
    project_id,
    survey_year,
    COUNT(*) FILTER (WHERE qualifies AND respondent_type = 'farmer')             AS farmer_co_owners,
    COUNT(*) FILTER (WHERE qualifies AND respondent_type = 'service_provider')   AS sp_co_owners,
    COUNT(*) FILTER (WHERE qualifies)                                             AS total_count
FROM s25_ownership_surveys
GROUP BY project_id, survey_year;

-- S6.3: Governance / regulations (Tier 2 + 3 only)
CREATE VIEW v_s63_kpi AS
SELECT
    project_id,
    survey_year,
    COUNT(*) FILTER (WHERE counted_in_kpi)               AS governance_count,
    COUNT(*) FILTER (WHERE progress_tier = 'Tier 2')     AS tier2_count,
    COUNT(*) FILTER (WHERE progress_tier = 'Tier 3')     AS tier3_count
FROM s63_governance_records
GROUP BY project_id, survey_year;

-- S6.4: Companies directly rewarding farmers
CREATE VIEW v_s64_kpi AS
SELECT
    project_id,
    survey_year,
    COUNT(DISTINCT company_profile_id) FILTER (WHERE counted_in_kpi)   AS companies_count,
    SUM(farmers_rewarded)              FILTER (WHERE counted_in_kpi)    AS total_farmers_rewarded
FROM s64_market_reward_records
GROUP BY project_id, survey_year;

-- S6.5: Companies with responsible procurement policy (Tier 2+)
CREATE VIEW v_s65_kpi AS
SELECT
    project_id,
    survey_year,
    COUNT(DISTINCT company_profile_id) FILTER (WHERE counted_in_kpi)   AS companies_count,
    COUNT(*) FILTER (WHERE progress_tier = 'Tier 2')                   AS tier2_count,
    COUNT(*) FILTER (WHERE progress_tier = 'Tier 3')                   AS tier3_count
FROM s65_procurement_records
GROUP BY project_id, survey_year;

-- Master cross-KPI summary per project per year (used by dashboard overview)
-- Uses achievement for sample-based KPIs (S6.1, S6.2, S2.1); falls back to sample_count
CREATE VIEW v_kpi_summary AS
SELECT
    p.project_code,
    p.project_name,
    p.country,
    p.commodity,
    y.survey_year,
    COALESCE(s61.achievement, s61.sample_count, 0) AS s61_count,
    COALESCE(s62.achievement, s62.sample_count, 0) AS s62_count,
    COALESCE(s21.achievement, s21.sample_count, 0) AS s21_count,
    COALESCE(s25.total_count,      0)                  AS s25_count,
    COALESCE(s63.governance_count, 0)                  AS s63_count,
    COALESCE(s64.companies_count,  0)                  AS s64_companies,
    COALESCE(s65.companies_count,  0)                  AS s65_companies
FROM projects p
CROSS JOIN (SELECT DISTINCT survey_year FROM farmer_profiles) y
LEFT JOIN v_s61_kpi s61 ON s61.project_id = p.id AND s61.survey_year = y.survey_year
LEFT JOIN v_s62_kpi s62 ON s62.project_id = p.id AND s62.survey_year = y.survey_year
LEFT JOIN v_s21_kpi s21 ON s21.project_id = p.id AND s21.survey_year = y.survey_year
LEFT JOIN v_s25_kpi s25 ON s25.project_id = p.id AND s25.survey_year = y.survey_year
LEFT JOIN v_s63_kpi s63 ON s63.project_id = p.id AND s63.survey_year = y.survey_year
LEFT JOIN v_s64_kpi s64 ON s64.project_id = p.id AND s64.survey_year = y.survey_year
LEFT JOIN v_s65_kpi s65 ON s65.project_id = p.id AND s65.survey_year = y.survey_year;


-- ── TRIGGERS ──────────────────────────────────────────────────────────────────

-- updated_at maintenance
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_farmer_updated_at
    BEFORE UPDATE ON farmer_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sp_updated_at
    BEFORE UPDATE ON service_provider_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cso_updated_at
    BEFORE UPDATE ON cso_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_company_updated_at
    BEFORE UPDATE ON company_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Baseline locking: once an ODK submission is approved, lock the farmer record
-- so baseline figures cannot be silently edited later.
CREATE OR REPLACE FUNCTION lock_baseline_on_approve()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
        UPDATE farmer_profiles
        SET    is_baseline       = TRUE,
               baseline_locked_at = NOW()
        WHERE  odk_submission_id = NEW.id
          AND  is_baseline = FALSE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_baseline
    AFTER UPDATE ON odk_submissions
    FOR EACH ROW EXECUTE FUNCTION lock_baseline_on_approve();


-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
-- Country managers see only their assigned country; admins see everything.
-- auth.uid() must match platform_users.id (handled by Supabase auth hook).

ALTER TABLE farmer_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cso_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE s61_resilience_surveys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE s62_viability_surveys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE s21_services_surveys     ENABLE ROW LEVEL SECURITY;
ALTER TABLE s21_sp_triangulation     ENABLE ROW LEVEL SECURITY;
ALTER TABLE s25_ownership_surveys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE s63_governance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE s64_market_reward_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE s65_procurement_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE odk_submissions          ENABLE ROW LEVEL SECURITY;

-- Helper: current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role STABLE LANGUAGE sql AS $$
    SELECT role FROM platform_users WHERE id = auth.uid()
$$;

-- Helper: current user's country (NULL = all)
CREATE OR REPLACE FUNCTION current_user_country()
RETURNS country_enum STABLE LANGUAGE sql AS $$
    SELECT country FROM platform_users WHERE id = auth.uid()
$$;

-- READ policy for farmer_profiles (all survey tables follow same pattern)
CREATE POLICY farmer_read ON farmer_profiles FOR SELECT USING (
    current_user_role() = 'admin'
    OR current_user_country() IS NULL
    OR country = current_user_country()
);

CREATE POLICY farmer_insert ON farmer_profiles FOR INSERT WITH CHECK (
    current_user_role() IN ('admin','country_manager','data_officer')
);

-- Data officers and above can insert ODK submissions; only admin/CM can approve
CREATE POLICY odk_read   ON odk_submissions FOR SELECT USING (current_user_role() IS NOT NULL);
CREATE POLICY odk_insert ON odk_submissions FOR INSERT WITH CHECK (
    current_user_role() IN ('admin','country_manager','data_officer')
);
CREATE POLICY odk_approve ON odk_submissions FOR UPDATE USING (
    current_user_role() IN ('admin','country_manager')
);


-- ── SEED DATA ─────────────────────────────────────────────────────────────────
-- Real ECA programme projects active in 2026 survey cohort.
-- Source: KPI_Data_Cleaned_for_Looker CSV (18 projects with 2026 data).
-- Project codes: {ISO2}-{SHORT}-{SEQ}

INSERT INTO projects (project_code, project_name, country, commodity, start_year, end_year) VALUES
-- Kenya (8 projects)
('KE-ANK-001', 'Acting Now - Kenya',                                     'Kenya',    'Coffee',   2026, 2030),
('KE-AFR-001', 'AFRI00 Kenya',                                           'Kenya',    'F&V',      2026, 2030),
('KE-CCA-001', 'CCAC Livestock Methane Reduction Strategy',              'Kenya',    'Dairy',    2026, 2030),
('KE-CSV-001', 'Creating Shared Value in Maize Value Chain in Kenya',    'Kenya',    'F&V',      2026, 2030),
('KE-DFN-001', 'Dream Fund Kenya (Climate Heroes)',                      'Kenya',    'Coffee',   2026, 2030),
('KE-P2P-001', 'Pathways to Prosperity - Kenya',                         'Kenya',    'Coffee',   2026, 2030),
('KE-SVP-001', 'Shade for Vegetables Project Kenya',                     'Kenya',    'F&V',      2026, 2030),
('KE-SYN-001', 'Synnefa Solidaridad P4G Project',                        'Kenya',    'F&V',      2026, 2030),
-- Ethiopia (1 project)
('ET-ANE-001', 'Acting Now - Ethiopia',                                  'Ethiopia', 'Coffee',   2026, 2030),
-- Tanzania (2 projects)
('TZ-GOL-001', 'Gold ECA FVO Project - Responsible ASGM Trade',         'Tanzania', 'Gold',     2026, 2030),
('TZ-P2P-001', 'Pathways to Prosperity - Tanzania',                      'Tanzania', 'Coffee',   2026, 2030),
-- Uganda (7 projects)
('UG-DFN-001', 'Dreamfund ECA Uganda project',                           'Uganda',   'Coffee',   2026, 2030),
('UG-FVO-001', 'FVO ICAM Cocoa Project',                                 'Uganda',   'Cocoa',    2026, 2030),
('UG-HAR-001', 'Harvesting Carbon: Carbon Mitigation DGBP Uganda',      'Uganda',   'Coffee',   2026, 2030),
('UG-NOP-001', 'NOPP Project Uganda',                                    'Uganda',   'Palm Oil', 2026, 2030),
('UG-REA-001', 'Resilient Agroforestry Extension Project (REAP)',        'Uganda',   'Coffee',   2026, 2030),
('UG-STB-001', 'Starbucks Uganda project',                               'Uganda',   'Coffee',   2026, 2030),
('UG-RCL-001', 'The root causes of child labour - Uganda',              'Uganda',   'Coffee',   2026, 2030);


-- ── SCHEMA NOTES ─────────────────────────────────────────────────────────────
-- 1. Composite index thresholds (meets_threshold) are intentionally NULL until
--    the M&E team defines cut-off scores after the baseline survey round.
--    Application layer writes these back via UPDATE after threshold decision.
--
-- 2. S2.5 qualifies flag is also set by reviewer, not auto-computed, because
--    ownership evidence requires document verification beyond the survey form.
--
-- 3. The v_kpi_summary view uses a CROSS JOIN against distinct survey years
--    from farmer_profiles. Once real data exists, replace with a years
--    reference table: CREATE TABLE survey_years (year SMALLINT PRIMARY KEY).
--
-- 4. Soil health scoring (S6.1 sub-component 1) uses raw lab values.
--    The scoring function (converting C/N % to 0-5) will be added in Sprint 2
--    once the M&E team confirms the scoring rubric from the SFVS test sheet.
--
-- 5. All tables use UUID PKs.  If bulk ODK import performance becomes an issue,
--    add BRIN indexes on created_at for time-range scans.
-- ============================================================================
