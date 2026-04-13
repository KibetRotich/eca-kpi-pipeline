import { supabaseAdmin } from '../supabase'

export async function normalizeCSOProfile(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('cso_profiles')
    .insert({
      odk_submission_id:    submissionId,
      project_id:           projectId,
      country:              d._country,
      survey_year:          surveyYear,
      cso_name:             d.cso_name              ?? null,
      cso_type:             d.cso_type              ?? null,
      cso_led_groups:       toArray(d.cso_led),
      advocates_for:        toArray(d.cso_advocates),
      cso_country:          d.cso_country           ?? null,
      scope:                d.cso_scope             ?? null,
      targeted_entity:      d.cso_target            ?? null,
      primary_theme:        d.cso_theme_primary     ?? null,
      secondary_theme:      d.cso_theme_secondary   ?? null,
      theme_narrative:      d.cso_theme_narrative   ?? null,
      dialogue_description: d.cso_theme_description ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`CSOProfile insert failed: ${error.message}`)
  return data.id
}

function toArray(v: unknown): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  return [String(v)]
}
