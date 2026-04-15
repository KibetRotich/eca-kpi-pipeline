/**
 * Normalizer: S6.1 Resilience Survey
 * Requires farmer_id — must be called after FarmerProfile is normalised.
 *
 * Computes resilience_index (0–35) and meets_threshold from raw sub-scores:
 *   soil_score        (0–5) derived from C:N ratio
 *   membership_score  (0–5) — f_S61_membership
 *   decision_score    (0–5) — f_S61_decision
 *   income_expenses   (0–5) — f_S61_income_expenses
 *   shock_sub_score   (0–5) derived from impact × recovery product, recategorised
 *   savings_score     (0–5) — f_S61_income_savings
 *   income_sources    (0–5) — f_S61_income_sources
 *
 * meets_threshold: provisional >= 18/35 until M&E team defines baseline cut-off.
 */

import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

/** Soil health score from C:N ratio (ideal 10–12:1 → 5) */
function soilScore(carbon: unknown, nitrogen: unknown): number {
  const c = carbon  != null ? Number(carbon)   : null
  const n = nitrogen != null ? Number(nitrogen) : null
  if (c == null || n == null || n === 0) return 0
  const cn = c / n
  if (cn >= 10 && cn <= 12) return 5
  if ((cn >= 8  && cn < 10) || (cn > 12 && cn <= 15)) return 4
  if ((cn >= 6  && cn < 8)  || (cn > 15 && cn <= 20)) return 3
  if ((cn >= 4  && cn < 6)  || (cn > 20 && cn <= 25)) return 2
  return 1
}

/**
 * Shock resilience sub-score: recategorise impact × recovery product.
 * Impact 1–3, Recovery 2–5 → product 2–15 → recategorised 1–5
 */
function shockSubScore(impact: unknown, recovery: unknown): number {
  const i = impact   != null ? Number(impact)   : null
  const r = recovery != null ? Number(recovery) : null
  if (i == null || r == null) return 0
  const p = i * r
  if (p <= 2)  return 1
  if (p <= 4)  return 2
  if (p <= 8)  return 3
  if (p <= 12) return 4
  return 5
}

function n(v: unknown): number { return v != null ? Number(v) : 0 }

export async function normalizeS61(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  farmerId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  // ── Compute resilience index ────────────────────────────────────────────────
  const soil     = soilScore(d.f_S61_soil_C, d.f_S61_soil_N)
  const shock    = shockSubScore(d.f_S61_income_impact, d.f_S61_income_recover)
  const resIndex = soil
    + n(d.f_S61_membership)         // fix: form exports f_S61_membership (not _score)
    + n(d.f_S61_decision)
    + n(d.f_S61_income_expenses)
    + shock
    + n(d.f_S61_income_savings)
    + n(d.f_S61_income_sources)

  const { data, error } = await supabaseAdmin
    .from('s61_resilience_surveys')
    .insert({
      farmer_id:            farmerId,
      odk_submission_id:    submissionId,
      project_id:           projectId,
      survey_year:          surveyYear,
      soil_test_method:     d.f_S61_soil_test       ?? null,
      soil_carbon:          d.f_S61_soil_C          != null ? Number(d.f_S61_soil_C)  : null,
      soil_nitrogen:        d.f_S61_soil_N          != null ? Number(d.f_S61_soil_N)  : null,
      soil_sample_id:       d.f_S61_soil_sampleID   ?? null,
      membership_score:     d.f_S61_membership      != null ? Number(d.f_S61_membership) : null,
      decision_score:       d.f_S61_decision        != null ? Number(d.f_S61_decision)   : null,
      income_expenses_score: d.f_S61_income_expenses != null ? Number(d.f_S61_income_expenses) : null,
      shocks_experienced:   toArray(d.f_S61_income_shocks),
      shock_impact_score:   d.f_S61_income_impact   != null ? Number(d.f_S61_income_impact)  : null,
      shock_recovery_score: d.f_S61_income_recover  != null ? Number(d.f_S61_income_recover) : null,
      savings_score:        d.f_S61_income_savings   != null ? Number(d.f_S61_income_savings) : null,
      income_sources_score: d.f_S61_income_sources   != null ? Number(d.f_S61_income_sources) : null,
      resilience_index:     resIndex,
      meets_threshold:      resIndex >= 18,   // provisional; M&E team to confirm cut-off after baseline
    })
    .select('id')
    .single()

  if (error) throw new Error(`S61 insert failed: ${error.message}`)
  return data.id
}
