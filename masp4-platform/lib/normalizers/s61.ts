/**
 * Normalizer: S6.1 Resilience Survey
 * Requires farmer_id — must be called after FarmerProfile is normalised.
 */

import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

export async function normalizeS61(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  farmerId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s61_resilience_surveys')
    .insert({
      farmer_id:            farmerId,
      odk_submission_id:    submissionId,
      project_id:           projectId,
      survey_year:          surveyYear,
      soil_test_method:     d.f_S61_soil_test       ?? null,
      soil_carbon:          d.f_S61_soil_C          ?? null,
      soil_nitrogen:        d.f_S61_soil_N          ?? null,
      soil_sample_id:       d.f_S61_soil_sampleID   ?? null,
      membership_score:     d.f_S61_membership_score ?? null,
      decision_score:       d.f_S61_decision        ?? null,
      income_expenses_score: d.f_S61_income_expenses ?? null,
      shocks_experienced:   toArray(d.f_S61_income_shocks),
      shock_impact_score:   d.f_S61_income_impact   ?? null,
      shock_recovery_score: d.f_S61_income_recover  ?? null,
      savings_score:        d.f_S61_income_savings   ?? null,
      income_sources_score: d.f_S61_income_sources   ?? null,
      // resilience_index and meets_threshold left NULL until M&E defines threshold
    })
    .select('id')
    .single()

  if (error) throw new Error(`S61 insert failed: ${error.message}`)
  return data.id
}
