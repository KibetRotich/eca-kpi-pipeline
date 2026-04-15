/**
 * Normalizers: S6.3 Governance, S6.4 Market Rewards, S6.5 Responsible Procurement
 *
 * S6.5 fix: fields previously read as d.policy, d.time_bound_commitments etc.
 *   now correctly read with f_S65_ prefix matching the Question Bank Data Point IDs.
 * S6.4 fix: f_S64_reward_type is Single-choice (not multi-select), removed toArray().
 */

import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

// S6.3 Governance
export async function normalizeS63(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  csoId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s63_governance_records')
    .insert({
      cso_profile_id:        csoId,
      odk_submission_id:     submissionId,
      project_id:            projectId,
      survey_year:           surveyYear,
      targeted_entity:       d.f_S63_entity               ?? null,
      regulation_type:       d.f_S63_regulation           ?? null,
      mandatory_type:        d.f_S63_regulation_mandatory ?? null,
      voluntary_type:        d.f_S63_regulation_voluntary ?? null,
      framework_change_desc: d.f_S63_framework_change     ?? null,
      progress_tier:         d.f_S63_framework_progress   ?? null,
      significance:          d.f_S63_framework_signifcance ?? null,
      smallholders_impacted: d.f_S63_framework_impact     ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S63 insert failed: ${error.message}`)
  return data.id
}

// S6.4 Market — company rewards
export async function normalizeS64(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  companyId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s64_market_reward_records')
    .insert({
      company_profile_id:       companyId,
      odk_submission_id:        submissionId,
      project_id:               projectId,
      survey_year:              surveyYear,
      commodity:                d.f_S64_commodity        ?? null,
      volume_purchased:         d.f_S64_volumne          ?? null,
      sustainability_framework: d.f_S64_framework        ?? null,
      directly_rewards_farmers: d.f_S64_reward           ?? null,
      reward_type:              d.f_S64_reward_type      ?? null,  // single-choice, not array
      reward_amount_eur:        d.f_S64_reward_amount    ?? null,
      farmers_rewarded:         d.f_S64_reward_farmers   ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S64 insert failed: ${error.message}`)
  return data.id
}

// S6.5 Responsible procurement
export async function normalizeS65(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  companyId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s65_procurement_records')
    .insert({
      company_profile_id:     companyId,
      odk_submission_id:      submissionId,
      project_id:             projectId,
      survey_year:            surveyYear,
      change_story:           d.f_S65_story                    ?? null,
      progress_tier:          d.f_S65_progress                 ?? null,
      commodities_covered:    toArray(d.f_S65_commodity),
      relevance_narrative:    d.f_S65_relevance                ?? null,
      relevance_label:        d.f_S65_relevance_label          ?? null,
      contribution_narrative: d.f_S65_contribution             ?? null,
      contribution_label:     d.f_S65_contribution_label       ?? null,
      has_policy:             d.f_S65_policy                   ?? null,
      has_smart_commitments:  d.f_S65_time_bound_commitments   ?? null,
      has_action_plan:        d.f_S65_action_plan              ?? null,
      countries_covered:      d.f_S65_country_covered          ?? null,
      third_party_verified:   d.f_S65_third_party_verification ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S65 insert failed: ${error.message}`)
  return data.id
}
