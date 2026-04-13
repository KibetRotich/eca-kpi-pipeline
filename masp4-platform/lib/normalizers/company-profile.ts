import { supabaseAdmin } from '../supabase'

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}

export async function normalizeCompanyProfile(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('company_profiles')
    .insert({
      odk_submission_id:    submissionId,
      project_id:           projectId,
      survey_year:          surveyYear,
      company_name:         d.c_name              ?? null,
      hq_country:           d.c_country           ?? null,
      company_type:         d.c_type              ?? null,
      scope:                d.c_scope             ?? null,
      commodities:          toArray(d.c_commodities),
      solidaridad_support:  toArray(d.c_support),
    })
    .select('id')
    .single()

  if (error) throw new Error(`CompanyProfile insert failed: ${error.message}`)
  return data.id
}
