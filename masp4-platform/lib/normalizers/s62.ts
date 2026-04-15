/**
 * Normalizer: S6.2 Farm Viability Survey
 * Requires farmer_id — must be called after FarmerProfile is normalised.
 *
 * Computes viability_index (0–30) and meets_threshold from 6 sub-scores:
 *   yield_score               (0–5)  derived from yield_increased + yield_increase_pct
 *   income_diversification    (0–5)  — f_S62_income_diversifcation (typo is intentional — matches source)
 *   income_perception         (0–5)  — f_S62_income_perception
 *   services_score            (0–5)  derived from net_promoter_score
 *   market_access             (0–5)  — f_S62_markets
 *   gap_score                 (0–5)  derived from count of 9 GAP practices adopted
 *
 * meets_threshold: viability_index > 10 (33% of max 30, per monitoring protocol)
 */

import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

function n(v: unknown): number { return v != null ? Number(v) : 0 }

/** Yield score from whether yield increased and by how much */
function yieldScore(increased: unknown, pct: unknown): number {
  const inc = increased === true || increased === 1 || increased === '1' || increased === 'Yes'
  const p   = pct != null ? Number(pct) : null
  if (!inc)          return 1
  if (p == null)     return 2
  if (p >= 20)       return 5
  if (p >= 10)       return 4
  if (p >= 5)        return 3
  if (p > 0)         return 2
  return 1
}

/** Services quality score proxied from Net Promoter Score (1–10) */
function servicesScore(nps: unknown): number {
  if (nps == null) return 0
  const v = Number(nps)
  if (v >= 9) return 5
  if (v >= 7) return 4
  if (v >= 5) return 3
  if (v >= 3) return 2
  return 1
}

/** GAP adoption score from count of 9 practices adopted */
function gapScore(practices: unknown): number {
  const arr = Array.isArray(practices) ? practices : (practices ? [practices] : [])
  const count = arr.length
  if (count === 0) return 0
  if (count <= 2)  return 1
  if (count <= 4)  return 2
  if (count <= 6)  return 3
  if (count <= 8)  return 4
  return 5
}

export async function normalizeS62(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  farmerId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const yS    = yieldScore(d.f_S62_yield_increase, d.f_S62_yield_increase_perc)
  const svcS  = servicesScore(d.f_S62_services_netpromoter)
  const gapP  = toArray(d.f_S62_markets_practices)
  const gapS  = gapScore(gapP)

  const viabilityIndex =
    yS
    + n(d.f_S62_income_diversifcation)   // typo matches source form field name
    + n(d.f_S62_income_perception)
    + svcS
    + n(d.f_S62_markets)
    + gapS

  const { data, error } = await supabaseAdmin
    .from('s62_viability_surveys')
    .insert({
      farmer_id:                    farmerId,
      odk_submission_id:            submissionId,
      project_id:                   projectId,
      survey_year:                  surveyYear,
      seed_variety:                 d.f_S62_yield_seed           ?? null,
      yield_value:                  d.f_S62_yield                != null ? Number(d.f_S62_yield) : null,
      yield_unit:                   d.f_S62_yield_unit           ?? null,
      total_output:                 d.f_S62_yield_output         != null ? Number(d.f_S62_yield_output) : null,
      output_unit:                  d.f_S62_yield_output_unit    ?? null,
      farm_size_ha:                 d.f_S62_yield_farm_size      != null ? Number(d.f_S62_yield_farm_size) : null,
      yield_increased:              d.f_S62_yield_increase === true || d.f_S62_yield_increase === 1 || null,
      yield_increase_pct:           d.f_S62_yield_increase_perc  != null ? Number(d.f_S62_yield_increase_perc) : null,
      income_diversification_score: d.f_S62_income_diversifcation != null ? Number(d.f_S62_income_diversifcation) : null,
      income_perception_score:      d.f_S62_income_perception    != null ? Number(d.f_S62_income_perception) : null,
      services_accessed:            toArray(d.f_S62_services),
      service_quality:              d.f_S62_services_quality     ?? null,
      net_promoter_score:           d.f_S62_services_netpromoter != null ? Number(d.f_S62_services_netpromoter) : null,
      market_access_score:          d.f_S62_markets              != null ? Number(d.f_S62_markets) : null,
      gap_practices_count:          gapP.length > 0 ? gapP.length : null,
      viability_index:              viabilityIndex,
      meets_threshold:              viabilityIndex > 10,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S62 insert failed: ${error.message}`)
  return data.id
}
