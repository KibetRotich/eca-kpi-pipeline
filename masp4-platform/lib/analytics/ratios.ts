/**
 * lib/analytics/ratios.ts — VSLA performance ratios from raw Kobo submissions.
 *
 * Each input row is a flat Kobo record (the `raw` jsonb from vsla_raw_submissions
 * / the same shape /api/submissions works with). Kobo prefixes every data column
 * with its survey-group path ("group_uh3oi66___What_is_the_total_group_savings")
 * and truncates long question names, so field lookup is done by *fuzzy substring*
 * against a priority-ordered candidate list — the real truncated slug fragment
 * first, the human XLSX label as a fallback. Whichever form the export arrives in,
 * the lookup still resolves.
 *
 * Every ratio guards its denominator: a 0 / null / undefined / missing divisor
 * yields `null`, never NaN and never a throw.
 */

// ── defensive field access ───────────────────────────────────────────────────

/**
 * Find the first field whose key contains one of `candidates` (checked in
 * priority order — most specific first) and return it as a number, or null.
 * Handles thousands separators and stray whitespace.
 */
export function getField(row: Record<string, any>, candidates: string[]): number | null {
  const raw = getRaw(row, candidates)
  return toNumber(raw)
}

/**
 * Same lookup, returning the raw value untouched. Two passes over the
 * priority-ordered candidates: an exact *suffix* match first (Kobo joins the
 * group path with '__', so the question slug is the key's suffix — this mirrors
 * the pipeline's `pick()` and disambiguates near-identical keys like the two
 * "positions_are_filled" / "If_yes_How_many_*" fields), then a looser substring
 * match as a fallback (handles trailing-underscore slugs and human labels).
 */
export function getRaw(row: Record<string, any>, candidates: string[]): any {
  const keys = Object.keys(row)
  for (const c of candidates) {
    const needle = c.toLowerCase()
    for (const key of keys) {
      if (key.toLowerCase().endsWith(needle)) return row[key]
    }
  }
  for (const c of candidates) {
    const needle = c.toLowerCase()
    for (const key of keys) {
      if (key.toLowerCase().includes(needle)) return row[key]
    }
  }
  return null
}

function toNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '').trim()) : Number(v)
  return Number.isNaN(n) ? null : n
}

const TRUE_SET = new Set(['yes', 'y', '1', 'true'])
// some Kobo lists encode "No" as the choice code 'option_2' rather than 'no'
const FALSE_SET = new Set(['no', 'n', '0', 'false', 'option_2', 'option 2'])

/** Tri-state Yes/No interpretation robust to decoded labels and raw codes. */
export function getBool(row: Record<string, any>, candidates: string[]): boolean | null {
  const v = getRaw(row, candidates)
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim().toLowerCase()
  if (TRUE_SET.has(s) || s.startsWith('yes')) return true
  if (FALSE_SET.has(s) || s.startsWith('no')) return false
  return null
}

/** Non-empty trimmed string, or null. */
export function getText(row: Record<string, any>, candidates: string[]): string | null {
  const v = getRaw(row, candidates)
  if (typeof v !== 'string') return v == null ? null : String(v)
  const s = v.trim()
  return s ? s : null
}

/**
 * A percentage/rate field must sit in [0,100]; anything outside is a data-entry
 * error (e.g. an absolute UGX amount — 300000 — typed into a "default rate"
 * field) → null. Mirrors the pipeline's `clean_rate` so the API never surfaces a
 * poisoned portfolioAtRiskProxy or repayment-rate correlation.
 */
function cleanRate(v: number | null): number | null {
  if (v === null) return null
  return v >= 0 && v <= 100 ? v : null
}

function monthsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const a = Date.parse(from.slice(0, 10))
  const b = Date.parse(to.slice(0, 10))
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round(((b - a) / (30.4375 * 86400000)) * 10) / 10
}

// ── candidate substrings (real truncated slug first, human label second) ─────

const F = {
  members_at_formation: ['members_w_he_VSLA_at_formation', 'members were in the VSLA at formation'],
  members_active: ['members_a_y_active_in_the_VSLA', 'currently active in the VSLA'],
  members_dropped: ['members_d_ter_the_first_Cycle', 'dropped from the VSLA group'],
  male_active: ['a_Male_001', 'a) Male'],
  female_active: ['b_Female_001', 'b) Female'],
  youth_active: ['c_youth_001', 'c) youth'],
  // only the numeric "_10b …how many positions are filled" count — deliberately
  // NOT the looser "positions_are_filled", which also matches the "_10c which
  // positions are filled" free-text field and would poison the number.
  leadership_filled: ['how_man_positions_are_filled', 'how many positions are filled'],
  women_leadership: ['If_yes_How_many_', 'women in leadership', '18a'],
  total_savings: ['total_group_savings', 'total group savings'],
  share_value: ['share_of_the_VSLA_group', 'share of the VSLA group'],
  avg_savings_per_member: ['averag_f_savings_per_member', 'average amount of savings per member'],
  total_loans_disbursed: ['loans_disbursed_out', 'Total in loans disbursed out'],
  avg_loan: ['averag_o_members_on_average', 'average loan disbursed to members'],
  repayment_rate: ['repaym_the_loans_given_out', 'repayment rate of the loans'],
  default_rate: ['defaul_the_loans_given_out', 'default rate on the loans'],
  swf_balance: ['total_social_welfare_fund', 'total amount of savings currently held'],
  swf_pct: ['percentage_of_social_welfare_fund', "percentage of the group's total savings"],
  linked_institution: ['your_VSLA_group_currently', 'linked to any local financial institution'],
  interest_fair: ['interest_rates_fair', 'interest rates fair and transparent'],
  registered: ['formally_registered', 'formally registered'],
  loan_criteria: ['criteria_do_y_ase_on_to_give_loans', 'criteria do you base on to give loans'],
  group_name: ['Name_of_VSLA_Group', 'name of the VSLA'],
  formation_date: ['Date_of_formation', 'date of formation'],
  assessment_date: ['Date_of_the_assessment', 'date of the assessment'],
} as const

const LEADERSHIP_SIZE = 8

// ── extracted per-group fields (raw + booleans, pre-ratio) ───────────────────

export interface GroupFields {
  groupId: string
  groupName: string
  members_at_formation: number | null
  members_active: number | null
  members_dropped: number | null
  male_active: number | null
  female_active: number | null
  youth_active: number | null
  leadership_filled: number | null
  women_leadership: number | null
  total_savings: number | null
  share_value: number | null
  avg_savings_per_member: number | null
  total_loans_disbursed: number | null
  avg_loan: number | null
  repayment_rate: number | null
  default_rate: number | null
  swf_balance: number | null
  swf_pct: number | null
  linked_institution: boolean | null
  interest_fair: boolean | null
  registered: boolean | null
  loan_criteria: string | null
  group_age_months: number | null
}

export function extractFields(row: Record<string, any>): GroupFields {
  const groupId = String(row['_id'] ?? row['_uuid'] ?? row['meta__rootUuid'] ?? '')
  return {
    groupId,
    groupName: getText(row, [...F.group_name]) ?? `Group ${groupId || '?'}`,
    members_at_formation: getField(row, [...F.members_at_formation]),
    members_active: getField(row, [...F.members_active]),
    members_dropped: getField(row, [...F.members_dropped]),
    male_active: getField(row, [...F.male_active]),
    female_active: getField(row, [...F.female_active]),
    youth_active: getField(row, [...F.youth_active]),
    leadership_filled: getField(row, [...F.leadership_filled]),
    women_leadership: getField(row, [...F.women_leadership]),
    total_savings: getField(row, [...F.total_savings]),
    share_value: getField(row, [...F.share_value]),
    avg_savings_per_member: getField(row, [...F.avg_savings_per_member]),
    total_loans_disbursed: getField(row, [...F.total_loans_disbursed]),
    avg_loan: getField(row, [...F.avg_loan]),
    repayment_rate: cleanRate(getField(row, [...F.repayment_rate])),
    default_rate: cleanRate(getField(row, [...F.default_rate])),
    swf_balance: getField(row, [...F.swf_balance]),
    swf_pct: cleanRate(getField(row, [...F.swf_pct])),
    linked_institution: getBool(row, [...F.linked_institution]),
    interest_fair: getBool(row, [...F.interest_fair]),
    registered: getBool(row, [...F.registered]),
    loan_criteria: getText(row, [...F.loan_criteria]),
    group_age_months: monthsBetween(
      getText(row, [...F.formation_date]),
      getText(row, [...F.assessment_date]),
    ),
  }
}

// ── ratios ────────────────────────────────────────────────────────────────────

export interface GroupRatios {
  groupId: string
  groupName: string
  savingsMobilizationRatio: number | null // total_savings / (members_active * share_value)
  loanToSavingsRatio: number | null // total_loans_disbursed / total_savings
  portfolioAtRiskProxy: number | null // default_rate / total_loans_disbursed
  swfRatio: number | null // swf_balance / total_savings
  leadershipCompleteness: number | null // leadership_filled / 8
  genderLeadershipRatio: number | null // women_leadership / leadership_filled
  youthInclusionRatio: number | null // youth_active / members_active
  retentionRate: number | null // 1 - (members_dropped / members_at_formation)
  growthRate: number | null // (members_active - members_at_formation) / members_at_formation
  maturityScore: number | null // composite z-score average
}

/** Safe division: null denominator, 0 denominator, or null numerator → null. */
function div(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null
  const r = num / den
  return Number.isFinite(r) ? r : null
}

function round(v: number | null, dp = 4): number | null {
  if (v === null) return null
  const f = 10 ** dp
  return Math.round(v * f) / f
}

/** Compute ratios for one group. `maturityScore` is filled later (needs all groups). */
export function computeRatios(f: GroupFields): GroupRatios {
  const membersActive = f.members_active
  const savingsMobilizationRatio = div(
    f.total_savings,
    membersActive !== null && f.share_value !== null ? membersActive * f.share_value : null,
  )
  return {
    groupId: f.groupId,
    groupName: f.groupName,
    savingsMobilizationRatio: round(savingsMobilizationRatio),
    loanToSavingsRatio: round(div(f.total_loans_disbursed, f.total_savings)),
    portfolioAtRiskProxy: round(div(f.default_rate, f.total_loans_disbursed), 6),
    swfRatio: round(div(f.swf_balance, f.total_savings)),
    leadershipCompleteness: round(div(f.leadership_filled, LEADERSHIP_SIZE)),
    genderLeadershipRatio: round(div(f.women_leadership, f.leadership_filled)),
    youthInclusionRatio: round(div(f.youth_active, membersActive)),
    retentionRate:
      f.members_dropped !== null && f.members_at_formation
        ? round(1 - f.members_dropped / f.members_at_formation)
        : null,
    growthRate:
      f.members_active !== null && f.members_at_formation
        ? round((f.members_active - f.members_at_formation) / f.members_at_formation)
        : null,
    maturityScore: null,
  }
}

// ── maturity score (cross-group z-scores) ────────────────────────────────────

/** Population z-scores of one column across groups; nulls stay null, sd=0 → 0. */
function zscore(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return values.map(() => null)
  const mean = present.reduce((a, b) => a + b, 0) / present.length
  const variance = present.reduce((a, b) => a + (b - mean) ** 2, 0) / present.length
  const sd = Math.sqrt(variance)
  return values.map((v) => (v === null ? null : sd === 0 ? 0 : (v - mean) / sd))
}

/**
 * Fill `maturityScore` on each group = mean of the available z-scores across
 * savingsMobilizationRatio, leadershipCompleteness, retentionRate, swfRatio.
 * Components that are null for a group are omitted (not zero-filled); a group
 * with no available component gets null.
 */
export function attachMaturityScores(ratios: GroupRatios[]): GroupRatios[] {
  const cols: (keyof GroupRatios)[] = [
    'savingsMobilizationRatio',
    'leadershipCompleteness',
    'retentionRate',
    'swfRatio',
  ]
  const zcols = cols.map((c) => zscore(ratios.map((r) => r[c] as number | null)))
  return ratios.map((r, i) => {
    const zs = zcols.map((col) => col[i]).filter((v): v is number => v !== null)
    const maturityScore =
      zs.length === 0 ? null : round(zs.reduce((a, b) => a + b, 0) / zs.length)
    return { ...r, maturityScore }
  })
}

/** Full pipeline: raw rows → extracted fields + ratios (with maturity). */
export function buildGroupAnalytics(rows: Record<string, any>[]): {
  fields: GroupFields[]
  ratios: GroupRatios[]
} {
  const fields = rows.map(extractFields)
  const ratios = attachMaturityScores(fields.map(computeRatios))
  return { fields, ratios }
}
