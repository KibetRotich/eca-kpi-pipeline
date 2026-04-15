/**
 * Normalizer: S2.1 Services Access
 *
 * Notes:
 *  - service_sources, quality_change, promoter_score are inside a begin_repeat
 *    in the Kobo form. Kobo exports repeats as f_S21_source[1], f_S21_source[2]…
 *    repeatFirst() collects the first non-null value; repeatAll() collects all.
 *  - new_services_introduced is BOOLEAN in schema; f_S21_amount is a numeric count.
 *    Map: count > 0 → true.
 *  - qualifies is GENERATED ALWAYS AS (new_services_introduced = TRUE OR
 *    quality_change = 'Quality improved') STORED — do NOT insert.
 */

import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

/**
 * Get the first non-null value from a possibly-repeated ODK field.
 * Handles both direct key (single response) and indexed keys [1], [2]…
 */
function repeatFirst(raw: Record<string, any>, key: string): any {
  if (raw[key] != null) return raw[key]
  for (let i = 1; i <= 20; i++) {
    const v = raw[`${key}[${i}]`]
    if (v != null) return v
  }
  return null
}

/**
 * Collect all values from a repeated ODK field as an array.
 */
function repeatAll(raw: Record<string, any>, key: string): any[] {
  if (raw[key] != null) return Array.isArray(raw[key]) ? raw[key] : [raw[key]]
  const results: any[] = []
  for (let i = 1; i <= 20; i++) {
    const v = raw[`${key}[${i}]`]
    if (v == null) break
    results.push(v)
  }
  return results
}

/**
 * Decode quality_change to match the schema's generated column expression:
 *   quality_change = 'Quality improved'
 * Common Kobo choice codes → canonical text values.
 */
function decodeQualityChange(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).toLowerCase().replace(/_/g, ' ')
  if (s === 'quality improved' || s === 'improved' || s === '1') return 'Quality improved'
  if (s === 'no change'        || s === 'same'     || s === '2') return 'No change'
  if (s === 'quality declined' || s === 'worse'    || s === '3') return 'Quality declined'
  return String(v)  // pass through unknown values as-is
}

// Farmer-side S2.1
export async function normalizeS21Farmer(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  farmerId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  // f_S21_amount = count of new services; schema expects BOOLEAN
  const amountRaw = repeatFirst(d, 'f_S21_amount')
  const newServices = amountRaw != null ? Number(amountRaw) > 0 : null

  const { data, error } = await supabaseAdmin
    .from('s21_services_surveys')
    .insert({
      farmer_id:               farmerId,
      odk_submission_id:       submissionId,
      project_id:              projectId,
      survey_year:             surveyYear,
      services_received:       toArray(d.f_S21_services),
      service_sources:         repeatFirst(d, 'f_S21_source'),
      new_services_introduced: newServices,
      quality_change:          decodeQualityChange(repeatFirst(d, 'f_S21_quality')),
      promoter_score:          repeatFirst(d, 'f_S21_score') != null
                                 ? Number(repeatFirst(d, 'f_S21_score'))
                                 : null,
      relevance_narrative:     repeatFirst(d, 'f_S21_relevance'),
      // qualifies is GENERATED ALWAYS — not inserted
    })
    .select('id')
    .single()

  if (error) throw new Error(`S21Farmer insert failed: ${error.message}`)
  return data.id
}

// Service Provider triangulation S2.1
export async function normalizeS21SP(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
  spId: string,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('s21_sp_triangulation')
    .insert({
      sp_profile_id:        spId,
      odk_submission_id:    submissionId,
      project_id:           projectId,
      survey_year:          surveyYear,
      services_offered:     toArray(d.sp_S21_services),
      new_services:         d.sp_S21_services_new      ?? null,
      improved_services:    d.sp_S21_services_improved ?? null,
      farmers_total:        d.sp_S21_number_farmers    ?? null,
      farmers_male:         d.sp_S21_number_farmers_m  ?? null,
      farmers_female:       d.sp_S21_number_farmers_f  ?? null,
      farmers_youth_male:   d.sp_S21_number_farmers_my ?? null,
      farmers_youth_female: d.sp_S21_number_farmers_fy ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`S21SP insert failed: ${error.message}`)
  return data.id
}
