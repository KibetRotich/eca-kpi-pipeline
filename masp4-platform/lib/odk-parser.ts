/**
 * ODK / Taro export parser
 *
 * ODK exports CSV with column headers matching the Data Point ID column
 * from the MASP IV question bank (e.g. f_profile_age, f_S61_membership_score).
 *
 * This module:
 *  1. Detects which form a CSV belongs to (via required sentinel columns)
 *  2. Parses each row into a typed payload
 *  3. Returns an array of OdkSubmission objects ready for the staging table
 */

export type FormId =
  | 'FarmerProfile'
  | 'ServiceProviderProfile'
  | 'CSOProfile'
  | 'CompanyProfile'
  | 'S61'
  | 'S62'
  | 'S21Farmer'
  | 'S21SP'
  | 'S25'
  | 'S63'
  | 'S64'
  | 'S65'

export interface ParsedSubmission {
  submission_uuid: string
  form_id: FormId
  project_code: string       // maps to projects.project_code
  country: string
  submitted_at: string       // ISO timestamp — from ODK metadata col or TODAY()
  raw_data: Record<string, unknown>
}

// ── Form detection: each form has at least one column unique to it ────────────

const FORM_SENTINELS: Record<FormId, string[]> = {
  FarmerProfile:         ['f_profile_id_national', 'f_profile_gender'],
  ServiceProviderProfile:['sp_name', 'sp_type'],
  CSOProfile:            ['cso_name', 'cso_type'],
  CompanyProfile:        ['c_name', 'c_type'],
  S61:                   ['f_S61_membership_score', 'f_S61_savings_score'],
  S62:                   ['f_S62_yield', 'f_S62_markets'],
  S21Farmer:             ['f_S21_services', 'f_S21_score'],
  S21SP:                 ['sp_S21_number_farmers', 'sp_S21_services_new'],
  S25:                   ['f_S25_ownership', 'sp_S25_ownership_members'],
  S63:                   ['f_S63_entity', 'f_S63_regulation'],
  S64:                   ['f_S64_reward', 'f_S64_reward_farmers'],
  S65:                   ['f_S65_story', 'f_S65_progress'],
}

export function detectFormId(headers: string[]): FormId | null {
  const headerSet = new Set(headers)
  for (const [formId, sentinels] of Object.entries(FORM_SENTINELS)) {
    if (sentinels.some(s => headerSet.has(s))) {
      return formId as FormId
    }
  }
  return null
}

// ── Required metadata columns (must be present in every ODK export) ──────────
// Data officers add these in ODK/Taro form design:
//   _uuid          — ODK auto-generated row UUID
//   _project_code  — dropdown mapped to projects.project_code
//   _country       — dropdown
//   _submission_time — ODK auto-generated

const META_UUID    = '_uuid'
const META_PROJECT = '_project_code'
const META_COUNTRY = '_country'
const META_TIME    = '_submission_time'

// ── Main parse function ───────────────────────────────────────────────────────

export function parseOdkRows(
  rows: Record<string, string>[],
  overrideFormId?: FormId,
): ParsedSubmission[] {
  if (rows.length === 0) return []

  const headers = Object.keys(rows[0])
  const formId  = overrideFormId ?? detectFormId(headers)
  if (!formId) throw new Error('Cannot detect form type from column headers. Check the CSV.')

  return rows.map((row, i) => {
    const uuid = row[META_UUID] || crypto.randomUUID()

    // Coerce numeric and boolean strings
    const coerced: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      if (v === '' || v === null || v === undefined) {
        coerced[k] = null
      } else if (v === 'TRUE' || v === 'true' || v === 'Yes' || v === 'yes') {
        coerced[k] = true
      } else if (v === 'FALSE' || v === 'false' || v === 'No' || v === 'no') {
        coerced[k] = false
      } else if (/^\d+$/.test(v)) {
        coerced[k] = parseInt(v, 10)
      } else if (/^\d+\.\d+$/.test(v)) {
        coerced[k] = parseFloat(v)
      } else if (v.includes(' ')) {
        // Multi-select values in ODK are space-separated
        coerced[k] = v.split(' ').map(s => s.trim()).filter(Boolean)
      } else {
        coerced[k] = v
      }
    }

    return {
      submission_uuid: uuid,
      form_id: formId,
      project_code: (row[META_PROJECT] ?? '').trim(),
      country: (row[META_COUNTRY] ?? '').trim(),
      submitted_at: row[META_TIME] ?? new Date().toISOString(),
      raw_data: coerced,
    }
  })
}
