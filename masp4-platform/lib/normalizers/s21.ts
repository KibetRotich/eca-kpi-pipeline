import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
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

  const { data, error } = await supabaseAdmin
    .from('s21_services_surveys')
    .insert({
      farmer_id:               farmerId,
      odk_submission_id:       submissionId,
      project_id:              projectId,
      survey_year:             surveyYear,
      services_received:       toArray(d.f_S21_services),
      service_sources:         d.f_S21_source  ?? null,
      new_services_introduced: d.f_S21_amount  ?? null,
      quality_change:          d.f_S21_quality ?? null,
      promoter_score:          d.f_S21_score   ?? null,
      relevance_narrative:     d.f_S21_relevance ?? null,
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
