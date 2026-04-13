import { supabaseAdmin } from '../supabase'

export async function normalizeServiceProviderProfile(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('service_provider_profiles')
    .insert({
      odk_submission_id: submissionId,
      project_id:        projectId,
      country:           d._country,
      survey_year:       surveyYear,
      sp_name:           d.sp_name              ?? null,
      is_female_owned:   d.sp_owned_female       ?? null,
      is_youth_owned:    d.sp_owned_youth        ?? null,
      sp_type:           d.sp_type              ?? null,
      financial_type:    d.sp_type_financial     ?? null,
      leadership_type:   d.sp_leadership         ?? null,
      year_established:  d.sp_year              ?? null,
      total_members:     d.sp_members           ?? null,
      female_members:    d.sp_members_f         ?? null,
      male_members:      d.sp_members_m         ?? null,
      total_employees:   d.sp_employees         ?? null,
      female_employees:  d.sp_employees_f       ?? null,
      male_employees:    d.sp_employees_m       ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`ServiceProviderProfile insert failed: ${error.message}`)
  return data.id
}
