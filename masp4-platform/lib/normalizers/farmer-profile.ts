/**
 * Normalizer: FarmerProfile
 * Maps raw ODK row (f_profile_* fields) → farmer_profiles table columns
 *
 * Notes:
 *  - gender: Kobo exports numeric codes (1=Male, 2=Female, 77=Other) — decoded here
 *  - is_youth: GENERATED ALWAYS AS (age IS NOT NULL AND age <= 35) STORED — do NOT insert
 *  - _country: now a metadata field added to the Kobo form; falls back to d._country
 */

import { supabaseAdmin } from '../supabase'

/** Decode Kobo numeric gender code to gender_enum text value */
function decodeGender(v: unknown): 'Male' | 'Female' | 'Other' | null {
  if (v === 1 || v === '1' || v === 'Male' || v === 'male') return 'Male'
  if (v === 2 || v === '2' || v === 'Female' || v === 'female') return 'Female'
  if (v === 77 || v === '77' || v === 'Other' || v === 'other') return 'Other'
  return null
}

export async function normalizeFarmerProfile(
  raw: Record<string, unknown>,
  projectId: string,
  submissionId: string,
  surveyYear: number,
): Promise<string> {
  const d = raw as Record<string, any>

  const { data, error } = await supabaseAdmin
    .from('farmer_profiles')
    .insert({
      odk_submission_id:   submissionId,
      project_id:          projectId,
      country:             d._country                  ?? null,
      commodity:           d.f_profile_primary_commodity ?? null,
      survey_year:         surveyYear,
      national_id:         d.f_profile_id_national     ?? null,
      farmer_uid:          d.f_profile_id_farmer        ?? null,
      full_name:           d.f_profile_profile_name     ?? null,
      age:                 d.f_profile_age              != null ? Number(d.f_profile_age) : null,
      birth_year:          d.f_profile_birth_year       != null ? Number(d.f_profile_birth_year) : null,
      gender:              decodeGender(d.f_profile_gender),
      // is_youth is GENERATED ALWAYS AS (age IS NOT NULL AND age <= 35) — not inserted
      education_level:     d.f_profile_education        ?? null,
      has_mobile_phone:    d.f_profile_phone            ?? null,
      has_mobile_internet: d.f_profile_internet         ?? null,
      household_size:      d.f_profile_hh_size          ?? null,
      household_role:      d.f_profile_household_head   ?? null,
      decision_maker:      d.f_profile_decision_making  ?? null,
      land_type:           d.f_profile_land_holding     ?? null,
      total_workers:       d.f_profile_workers          ?? null,
      hired_workers:       d.f_profile_workers_hired    ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`FarmerProfile insert failed: ${error.message}`)
  return data.id
}
