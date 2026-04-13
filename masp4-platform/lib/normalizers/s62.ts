import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

export async function normalizeS62(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  farmerId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s62_viability_surveys')
    .insert({
      farmer_id:                    farmerId,
      odk_submission_id:            submissionId,
      project_id:                   projectId,
      survey_year:                  surveyYear,
      seed_variety:                 d.f_S62_yield_seed           ?? null,
      yield_value:                  d.f_S62_yield                ?? null,
      yield_unit:                   d.f_S62_yield_unit           ?? null,
      total_output:                 d.f_S62_yield_output         ?? null,
      output_unit:                  d.f_S62_yield_output_unit    ?? null,
      farm_size_ha:                 d.f_S62_yield_farm_size      ?? null,
      yield_increased:              d.f_S62_yield_increase       ?? null,
      yield_increase_pct:           d.f_S62_yield_increase_perc  ?? null,
      income_diversification_score: d.f_S62_income_diversifcation ?? null,
      income_perception_score:      d.f_S62_income_perception    ?? null,
      services_accessed:            toArray(d.f_S62_services),
      service_quality:              d.f_S62_services_quality     ?? null,
      net_promoter_score:           d.f_S62_services_netpromoter ?? null,
      market_access_score:          d.f_S62_markets              ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S62 insert failed: ${error.message}`)
  return data.id
}
