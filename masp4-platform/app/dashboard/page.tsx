/**
 * /dashboard — MASP IV KPI Dashboard
 * Aggregates approved data from all 7 KPI views.
 */

import { supabaseAdmin } from '@/lib/supabase'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ year?: string; country?: string; commodity?: string }>
}

const COUNTRIES   = ['Ethiopia','Kenya','Tanzania','Uganda']
const COMMODITIES = ['Cocoa','Coffee','Cotton','Dairy','Fashion','F&V','Gold','Leather','Palm Oil','Tea']

export default async function DashboardPage({ searchParams }: Props) {
  const sp        = await searchParams
  const year      = sp.year      ? parseInt(sp.year, 10) : null
  const country   = sp.country   ?? ''
  const commodity = sp.commodity ?? ''

  // ── Query each KPI view, joined to projects for country/commodity ─────────

  async function queryKpi(view: string, extraCols: string = '') {
    let q = supabaseAdmin
      .from(view)
      .select(`*, projects!inner(project_code, country, commodity)`)
    if (year)      q = (q as any).eq('survey_year', year)
    if (country)   q = (q as any).eq('projects.country', country)
    if (commodity) q = (q as any).eq('projects.commodity', commodity)
    const { data } = await q
    return data ?? []
  }

  const [s61, s62, s21, s25, s63, s64, s65, summaryRaw, outputRaw] = await Promise.all([
    queryKpi('v_s61_kpi'),
    queryKpi('v_s62_kpi'),
    queryKpi('v_s21_kpi'),
    queryKpi('v_s25_kpi'),
    queryKpi('v_s63_kpi'),
    queryKpi('v_s64_kpi'),
    queryKpi('v_s65_kpi'),
    // Summary view already has country/commodity — filter separately
    (async () => {
      let q = supabaseAdmin.from('v_kpi_summary').select('*')
      if (year)      q = q.eq('survey_year', year)
      if (country)   q = q.eq('country', country as any)
      if (commodity) q = q.eq('commodity', commodity as any)
      const { data } = await q
      return data ?? []
    })(),
    // Output records — farmers trained (direct count, all delivery channels)
    (async () => {
      let q = supabaseAdmin
        .from('project_output_records')
        .select('farmers_trained, female_count, male_count, youth_count, projects!inner(country, commodity)')
      if (year)      q = (q as any).eq('survey_year', year)
      if (country)   q = (q as any).eq('projects.country',   country)
      if (commodity) q = (q as any).eq('projects.commodity', commodity)
      const { data } = await q
      return data ?? []
    })(),
  ])

  // ── Aggregate totals ──────────────────────────────────────────────────────

  function sum(rows: any[], col: string) {
    return rows.reduce((acc: number, r: any) => acc + (Number(r[col]) || 0), 0)
  }

  // For sample-based KPIs: use achievement (extrapolated) when targets exist, else sample_count
  function kpiCount(rows: any[]) {
    const ach = sum(rows, 'achievement')
    return ach > 0 ? ach : sum(rows, 'sample_count')
  }
  function hasAchievement(rows: any[]) {
    return rows.some((r: any) => Number(r.achievement) > 0)
  }
  function totalSample(rows: any[]) { return sum(rows, 'sample_size') }
  function avgSamplePct(rows: any[]) {
    const counted = rows.filter((r: any) => r.sample_pct != null)
    if (!counted.length) return null
    return Math.round(counted.reduce((a: number, r: any) => a + Number(r.sample_pct), 0) / counted.length)
  }

  const kpis = {
    s61: {
      code: 'S6.1', label: 'Farmers with enhanced resilience',
      pathway: 'Production',
      count:      kpiCount(s61),
      estimated:  hasAchievement(s61),
      sampleSize: totalSample(s61),
      samplePct:  avgSamplePct(s61),
      female: sum(s61, 'achievement_female') || sum(s61, 'sample_f_threshold'),
      male:   sum(s61, 'achievement_male')   || sum(s61, 'sample_m_threshold'),
      youth:  sum(s61, 'achievement_youth')  || sum(s61, 'sample_y_threshold'),
      avgIndex: s61.length ? (s61.reduce((a: number, r: any) => a + Number(r.avg_index || 0), 0) / s61.length).toFixed(1) : null,
    },
    s62: {
      code: 'S6.2', label: 'Farmers with improved farm viability',
      pathway: 'Production',
      count:      kpiCount(s62),
      estimated:  hasAchievement(s62),
      sampleSize: totalSample(s62),
      samplePct:  avgSamplePct(s62),
      female: sum(s62, 'achievement_female') || sum(s62, 'sample_f_threshold'),
      male:   sum(s62, 'achievement_male')   || sum(s62, 'sample_m_threshold'),
      youth:  sum(s62, 'achievement_youth')  || sum(s62, 'sample_y_threshold'),
      avgIndex: s62.length ? (s62.reduce((a: number, r: any) => a + Number(r.avg_index || 0), 0) / s62.length).toFixed(1) : null,
    },
    s21: {
      code: 'S2.1', label: 'Farmers accessing new/improved services',
      pathway: 'Services',
      count:      kpiCount(s21),
      estimated:  hasAchievement(s21),
      sampleSize: totalSample(s21),
      samplePct:  avgSamplePct(s21),
      female: sum(s21, 'achievement_female') || sum(s21, 'sample_f_threshold'),
      male:   sum(s21, 'achievement_male')   || sum(s21, 'sample_m_threshold'),
      youth:  sum(s21, 'achievement_youth')  || sum(s21, 'sample_y_threshold'),
    },
    s25: {
      code: 'S2.5', label: 'Individuals co-owning businesses',
      pathway: 'Services',
      count:  sum(s25, 'total_count'),
      farmerOwners: sum(s25, 'farmer_co_owners'),
      spOwners:     sum(s25, 'sp_co_owners'),
    },
    s63: {
      code: 'S6.3', label: 'Regulations/frameworks improved',
      pathway: 'Governance',
      count:  sum(s63, 'governance_count'),
      tier2:  sum(s63, 'tier2_count'),
      tier3:  sum(s63, 'tier3_count'),
    },
    s64: {
      code: 'S6.4', label: 'Companies rewarding farmers directly',
      pathway: 'Market',
      count:          sum(s64, 'companies_count'),
      farmersRewarded: sum(s64, 'total_farmers_rewarded'),
    },
    s65: {
      code: 'S6.5', label: 'Companies with responsible procurement',
      pathway: 'Market',
      count: sum(s65, 'companies_count'),
      tier2: sum(s65, 'tier2_count'),
      tier3: sum(s65, 'tier3_count'),
    },
  }

  // ── Output KPI totals (farmers trained — direct headcount) ───────────────
  const outputTotal  = sum(outputRaw, 'farmers_trained')
  const outputFemale = sum(outputRaw, 'female_count')
  const outputMale   = sum(outputRaw, 'male_count')
  const outputYouth  = sum(outputRaw, 'youth_count')

  // ── Country breakdown (from summary view) ─────────────────────────────────
  const byCountry = COUNTRIES.map(c => {
    const rows = summaryRaw.filter((r: any) => r.country === c)
    return {
      country:   c,
      s61_count: sum(rows, 's61_count'),
      s62_count: sum(rows, 's62_count'),
      s21_count: sum(rows, 's21_count'),
      s25_count: sum(rows, 's25_count'),
      s63_count: sum(rows, 's63_count'),
      s64_companies: sum(rows, 's64_companies'),
      s65_companies: sum(rows, 's65_companies'),
    }
  })

  // ── Year trend data (for bottom TrendChart — S6.1/S6.2/S2.1 only) ──────────
  const { data: trendRaw } = await supabaseAdmin
    .from('v_kpi_summary')
    .select('survey_year, s61_count, s62_count, s21_count')
    .order('survey_year')

  const trendByYear = Array.from(
    (trendRaw ?? []).reduce((map, r: any) => {
      const y = r.survey_year
      if (!map.has(y)) map.set(y, { year: y, s61: 0, s62: 0, s21: 0 })
      const e = map.get(y)
      e.s61 += Number(r.s61_count) || 0
      e.s62 += Number(r.s62_count) || 0
      e.s21 += Number(r.s21_count) || 0
      return map
    }, new Map())
  ).map(([, v]) => v)

  // ── Per-KPI 5-year trends for KPI bar charts ──────────────────────────────
  // Targets: sum project_kpi_targets across all years (respects country/commodity filter)
  // Achievements: from v_kpi_summary across all years
  const CHART_YEARS = [2026, 2027, 2028, 2029, 2030]
  const KPI_CODES   = ['S6.1','S6.2','S2.1','S2.5','S6.3','S6.4','S6.5']

  let targetsQuery = supabaseAdmin
    .from('project_kpi_targets')
    .select('survey_year, kpi_code, target_total, projects!inner(country, commodity)')
  if (country)   targetsQuery = (targetsQuery as any).eq('projects.country',   country)
  if (commodity) targetsQuery = (targetsQuery as any).eq('projects.commodity', commodity)

  let achAllQuery = supabaseAdmin
    .from('v_kpi_summary')
    .select('survey_year, s61_count, s62_count, s21_count, s25_count, s63_count, s64_companies, s65_companies')
  if (country)   achAllQuery = (achAllQuery as any).eq('country',   country)
  if (commodity) achAllQuery = (achAllQuery as any).eq('commodity', commodity)

  const [{ data: targetsRaw }, { data: achAllRaw }] = await Promise.all([targetsQuery, achAllQuery])

  // Sum targets per kpi_code × year
  const tgtSums: Record<string, Record<number, number>> = {}
  for (const r of targetsRaw ?? []) {
    if (!tgtSums[r.kpi_code]) tgtSums[r.kpi_code] = {}
    tgtSums[r.kpi_code][r.survey_year] = (tgtSums[r.kpi_code][r.survey_year] || 0) + r.target_total
  }

  // Sum achievements per KPI × year
  const achSums: Record<string, Record<number, number>> = Object.fromEntries(KPI_CODES.map(k => [k, {}]))
  for (const r of achAllRaw ?? []) {
    const y = r.survey_year
    achSums['S6.1'][y] = (achSums['S6.1'][y] || 0) + (Number(r.s61_count)     || 0)
    achSums['S6.2'][y] = (achSums['S6.2'][y] || 0) + (Number(r.s62_count)     || 0)
    achSums['S2.1'][y] = (achSums['S2.1'][y] || 0) + (Number(r.s21_count)     || 0)
    achSums['S2.5'][y] = (achSums['S2.5'][y] || 0) + (Number(r.s25_count)     || 0)
    achSums['S6.3'][y] = (achSums['S6.3'][y] || 0) + (Number(r.s63_count)     || 0)
    achSums['S6.4'][y] = (achSums['S6.4'][y] || 0) + (Number(r.s64_companies) || 0)
    achSums['S6.5'][y] = (achSums['S6.5'][y] || 0) + (Number(r.s65_companies) || 0)
  }

  // Build trend arrays aligned to CHART_YEARS
  const kpiTrends: Record<string, { year: number; target: number; achievement: number }[]> =
    Object.fromEntries(KPI_CODES.map(code => [
      code,
      CHART_YEARS.map(y => ({
        year:        y,
        target:      tgtSums[code]?.[y]  || 0,
        achievement: achSums[code]?.[y]  || 0,
      })),
    ]))

  return (
    <DashboardClient
      kpis={kpis}
      byCountry={byCountry}
      trendByYear={trendByYear}
      kpiTrends={kpiTrends}
      outputTotal={outputTotal}
      outputFemale={outputFemale}
      outputMale={outputMale}
      outputYouth={outputYouth}
      currentYear={year ? String(year) : ''}
      currentCountry={country}
      currentCommodity={commodity}
      countries={COUNTRIES}
      commodities={COMMODITIES}
    />
  )
}
