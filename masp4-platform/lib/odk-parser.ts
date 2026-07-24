/**
 * ODK / Taro export parser
 *
 * ODK exports CSV with column headers matching the Data Point ID column
 * from the MASP IV question bank (e.g. f_profile_age, f_S61_membership).
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
  // V2 form (Kobo deployment masp4_farmer_survey_v2) adds these two top-level
  // metadata fields. V1 CSVs leave them null and the importer ignores them.
  commodity: string | null
  survey_round: string | null   // 'baseline' | 'midline' | 'endline' | 'annual'
  raw_data: Record<string, unknown>
}

// ── Form detection: each form has at least one column unique to it ────────────
// S6.1 sentinels match the Kobo Data Point IDs: f_S61_membership, f_S61_income_savings
// (not f_S61_membership_score / f_S61_savings_score which were a prior naming draft)

const FORM_SENTINELS: Record<FormId, string[]> = {
  FarmerProfile:         ['f_profile_id_national', 'f_profile_gender'],
  ServiceProviderProfile:['sp_name', 'sp_type'],
  CSOProfile:            ['cso_name', 'cso_type'],
  CompanyProfile:        ['c_name', 'c_type'],
  S61:                   ['f_S61_membership', 'f_S61_income_savings'],
  S62:                   ['f_S62_yield', 'f_S62_markets'],
  S21Farmer:             ['f_S21_services', 'f_S21_score'],
  S21SP:                 ['sp_S21_number_farmers', 'sp_S21_services_new'],
  S25:                   ['f_S25_ownership', 'sp_S25_ownership_members'],
  S63:                   ['f_S63_entity', 'f_S63_regulation'],
  S64:                   ['f_S64_reward', 'f_S64_reward_farmers'],
  S65:                   ['f_S65_story', 'f_S65_progress'],
}

// Kobo's CSV export can emit a column header in one of two styles:
//   flat:           "f_profile_id_national"
//   group-prefixed: "farmer_profile/farmer_profile_demographic/f_profile_id_national"
// Build a Set of leaf names (segment after the last "/") so detection and field
// lookups work for both. V1 deployments used flat export; V2 deployments under
// newer KoboToolbox UI default to group-prefixed export, which is why V2 CSVs
// otherwise produced "Cannot detect form type from column headers".
function leafSet(headers: string[]): Set<string> {
  const out = new Set<string>()
  for (const h of headers) {
    out.add(h)
    const slash = h.lastIndexOf('/')
    if (slash !== -1) out.add(h.slice(slash + 1))
  }
  return out
}

export function detectFormId(headers: string[]): FormId | null {
  const set = leafSet(headers)
  for (const [formId, sentinels] of Object.entries(FORM_SENTINELS)) {
    if (sentinels.some(s => set.has(s))) {
      return formId as FormId
    }
  }
  return null
}

// ── Required metadata columns ─────────────────────────────────────────────────
// Data officers add these in ODK/Taro form design:
//   _uuid           — ODK auto-generated row UUID  (also accepted without underscore: "uuid")
//   _project_code   — dropdown mapped to projects.project_code
//   _country        — dropdown
//   _submission_time — ODK auto-generated

const META_UUID    = '_uuid'
const META_PROJECT = '_project_code'
const META_COUNTRY = '_country'
const META_TIME    = '_submission_time'
const META_COMMODITY    = '_commodity'      // V2 only
const META_SURVEY_ROUND = '_survey_round'   // V2 only

// Read a field by leaf name, falling back to any column whose path ends in "/leaf".
// Handles both flat and group-prefixed Kobo exports without forcing the parser
// to know which group a field lives in. Returns undefined if not present.
function readLeaf(row: Record<string, string>, leaf: string): string | undefined {
  if (row[leaf] !== undefined) return row[leaf]
  const suffix = '/' + leaf
  for (const k of Object.keys(row)) {
    if (k.endsWith(suffix)) return row[k]
  }
  return undefined
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseOdkRows(
  rows: Record<string, string>[],
  overrideFormId?: FormId,
): ParsedSubmission[] {
  if (rows.length === 0) return []

  const headers = Object.keys(rows[0])
  const formId  = overrideFormId ?? detectFormId(headers)
  if (!formId) throw new Error('Cannot detect form type from column headers. Check the CSV.')

  return rows.map((row) => {
    // Accept both _uuid (ODK Central export) and uuid (Kobo calculate field export)
    const uuid = readLeaf(row, META_UUID) || readLeaf(row, 'uuid') || crypto.randomUUID()

    // Coerce numeric and boolean strings. We keep the original column key (which
    // may be group-prefixed) so existing normalizers that read raw_data continue
    // to find their fields; readLeaf is only used for cross-cutting metadata.
    const coerced: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      if (v === '' || v === null || v === undefined) {
        coerced[k] = null
      } else if (v === 'TRUE' || v === 'true' || v === 'Yes' || v === 'yes' || v === '1') {
        coerced[k] = true
      } else if (v === 'FALSE' || v === 'false' || v === 'No' || v === 'no' || v === '0') {
        coerced[k] = false
      } else if (/^\d+$/.test(v) && v.length > 1) {
        // Only parse as integer if more than 1 digit — single 0/1 handled above as boolean
        coerced[k] = parseInt(v, 10)
      } else if (/^\d+\.\d+$/.test(v)) {
        coerced[k] = parseFloat(v)
      } else if (v.includes(' ') && !v.includes('  ')) {
        // Multi-select values in ODK are space-separated (single spaces between codes)
        coerced[k] = v.split(' ').map(s => s.trim()).filter(Boolean)
      } else {
        coerced[k] = v
      }
    }

    // Mirror leaf-named copies of group-prefixed keys into coerced so downstream
    // normalizers (which read flat keys like d.f_profile_age) keep working when
    // Kobo exports with group paths. Only writes if the leaf key is absent so V1
    // CSVs are byte-for-byte unchanged.
    for (const k of Object.keys(coerced)) {
      const slash = k.lastIndexOf('/')
      if (slash === -1) continue
      const leaf = k.slice(slash + 1)
      if (!(leaf in coerced)) coerced[leaf] = coerced[k]
    }

    const commodity = readLeaf(row, META_COMMODITY)
    const surveyRound = readLeaf(row, META_SURVEY_ROUND)

    return {
      submission_uuid: uuid,
      form_id: formId,
      project_code: (readLeaf(row, META_PROJECT) ?? '').trim(),
      country: (readLeaf(row, META_COUNTRY) ?? '').trim(),
      submitted_at: readLeaf(row, META_TIME) ?? new Date().toISOString(),
      commodity: commodity ? commodity.trim() : null,
      survey_round: surveyRound ? surveyRound.trim() : null,
      raw_data: coerced,
    }
  })
}
