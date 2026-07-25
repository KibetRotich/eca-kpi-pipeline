/**
 * GET /api/analytics — VSLA exploratory analytics.
 *
 * Additive, read-only. Reads the nightly-synced raw Kobo submissions from
 * `vsla_raw_submissions.raw` (the same flat, Kobo-keyed objects /api/submissions
 * works with) via the shared `supabaseAdmin` client — no Kobo credentials are
 * duplicated here and no existing file is modified. (MCP Kobo tools are only
 * available in the dev session, not at Vercel runtime, so the DB mirror is the
 * correct production source.)
 *
 * Returns: { groups: GroupRatios[], inferences: {...} }.
 * Every statistic is directional at n≈26 — each inference carries a caveat note.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildGroupAnalytics, type GroupFields } from '@/lib/analytics/ratios'
import { spearmanCorrelation, mannWhitneyU, fishersExactTest } from '@/lib/analytics/stats'

export const dynamic = 'force-dynamic'

const MIN_N = 5
function smallNote(n: number) {
  return `n=${n} — treat as directional, not confirmatory`
}

/** Pair two group-level numeric fields, dropping rows where either is null. */
function pairedNonNull(
  a: (number | null)[],
  b: (number | null)[],
): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== null && b[i] !== null) {
      x.push(a[i] as number)
      y.push(b[i] as number)
    }
  }
  return { x, y }
}

function spearmanResult(
  label: string,
  xName: string,
  yName: string,
  xs: (number | null)[],
  ys: (number | null)[],
) {
  const { x, y } = pairedNonNull(xs, ys)
  const n = x.length
  if (n < MIN_N) {
    return {
      test: 'spearman',
      label,
      x: xName,
      y: yName,
      n,
      skipped: true,
      note: `Skipped — only ${n} paired non-null observations (need ≥${MIN_N}).`,
    }
  }
  const rho = spearmanCorrelation(x, y)
  return {
    test: 'spearman',
    label,
    x: xName,
    y: yName,
    n,
    rho: Number.isNaN(rho) ? null : Math.round(rho * 1000) / 1000,
    note: smallNote(n),
  }
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('vsla_raw_submissions')
    .select('kobo_id, raw')
    .order('kobo_id', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: Record<string, any>[] = (data ?? [])
    .map((r: any) => r.raw)
    .filter((r: any) => r && typeof r === 'object')

  const { fields, ratios } = buildGroupAnalytics(rows)

  // ── helper column accessors over the extracted fields ──────────────────────
  const col = (k: keyof GroupFields) => fields.map((f) => f[k] as number | null)
  const ratioCol = (k: keyof (typeof ratios)[number]) =>
    ratios.map((r) => r[k] as number | null)

  // 1. Spearman: group age vs average savings per member
  const infAgeVsSavings = spearmanResult(
    'Group age vs average savings per member',
    'groupAgeMonths',
    'avgSavingsPerMember',
    col('group_age_months'),
    col('avg_savings_per_member'),
  )

  // 2. Spearman: leadership completeness vs repayment rate
  const infLeadershipVsRepayment = spearmanResult(
    'Leadership completeness vs repayment rate',
    'leadershipCompleteness',
    'repaymentRate',
    ratioCol('leadershipCompleteness'),
    col('repayment_rate'),
  )

  // 3. Spearman: gender leadership ratio vs social-welfare-fund ratio
  const infGenderVsSwf = spearmanResult(
    'Gender leadership ratio vs social-welfare-fund ratio',
    'genderLeadershipRatio',
    'swfRatio',
    ratioCol('genderLeadershipRatio'),
    ratioCol('swfRatio'),
  )

  // 4. Mann–Whitney: avg savings per member split by institutional linkage
  const linked = col('avg_savings_per_member').filter(
    (_, i) => fields[i].linked_institution === true,
  ) as number[]
  const linkedVals = linked.filter((v) => v !== null)
  const notLinkedVals = col('avg_savings_per_member').filter(
    (v, i) => v !== null && fields[i].linked_institution === false,
  ) as number[]
  let infLinkage: Record<string, any>
  const mwN = linkedVals.length + notLinkedVals.length
  if (linkedVals.length < 3 || notLinkedVals.length < 3 || mwN < MIN_N) {
    infLinkage = {
      test: 'mann-whitney',
      label: 'Average savings per member — linked vs not linked to a financial institution',
      split: 'linked_institution',
      nLinked: linkedVals.length,
      nNotLinked: notLinkedVals.length,
      skipped: true,
      note: `Skipped — group sizes (linked=${linkedVals.length}, not-linked=${notLinkedVals.length}) too small.`,
    }
  } else {
    const { u, pApprox } = mannWhitneyU(linkedVals, notLinkedVals)
    infLinkage = {
      test: 'mann-whitney',
      label: 'Average savings per member — linked vs not linked to a financial institution',
      split: 'linked_institution',
      nLinked: linkedVals.length,
      nNotLinked: notLinkedVals.length,
      u,
      pApprox: Number.isNaN(pApprox) ? null : Math.round(pApprox * 1000) / 1000,
      note: smallNote(mwN),
    }
  }

  // 5. Fisher's exact: interest_fair (Yes/No) × registered (Yes/No)
  let a = 0
  let b = 0
  let c = 0
  let d = 0
  let fisherN = 0
  for (const f of fields) {
    if (f.interest_fair === null || f.registered === null) continue
    fisherN++
    if (f.interest_fair && f.registered) a++
    else if (f.interest_fair && !f.registered) b++
    else if (!f.interest_fair && f.registered) c++
    else d++
  }
  let infInterestRegistered: Record<string, any>
  if (fisherN < MIN_N) {
    infInterestRegistered = {
      test: 'fisher',
      label: 'Fair interest rates × formally registered',
      n: fisherN,
      skipped: true,
      note: `Skipped — only ${fisherN} groups answered both questions (need ≥${MIN_N}).`,
    }
  } else {
    const p = fishersExactTest(a, b, c, d)
    infInterestRegistered = {
      test: 'fisher',
      label: 'Fair interest rates × formally registered',
      n: fisherN,
      table: { interestFair_registered: a, interestFair_notRegistered: b, notFair_registered: c, notFair_notRegistered: d },
      pValue: Number.isNaN(p) ? null : Math.round(p * 1000) / 1000,
      note: smallNote(fisherN),
    }
  }

  return NextResponse.json({
    groups: ratios,
    inferences: {
      ageVsSavings: infAgeVsSavings,
      leadershipVsRepayment: infLeadershipVsRepayment,
      genderVsSwf: infGenderVsSwf,
      savingsByLinkage: infLinkage,
      interestFairVsRegistered: infInterestRegistered,
    },
  })
}
