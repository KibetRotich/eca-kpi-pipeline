/**
 * /dashboard — MASP IV KPI Dashboard
 * Aggregates approved data from all KPI views + rec records.
 */

import { supabaseAdmin } from '@/lib/supabase'
import DashboardClient from './DashboardClient'
import { indicatorProgress, type FrameworkValueRow } from '@/lib/framework-progress'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ year?: string; country?: string; commodity?: string }>
}

const COUNTRIES   = ['Ethiopia','Kenya','Tanzania','Uganda']
const COMMODITIES = ['Cocoa','Coffee','Cotton','Dairy','Fashion','F&V','Gold','Leather','Palm Oil','Tea']
const REC_CODES   = ['REC01','REC02','REC03','REC04','REC05'] as const
const FIRST_FARMER_YEAR = 2022   // earliest year in the measurement frameworks

/**
 * REC01–REC05 from the per-project Measurement Framework, shaped like the old
 * project_rec_records rows: { survey_year, rec_code, count, projects }.
 * Per-period values are summed within a year; for an indicator marked as a running
 * total only its latest value in the year counts.
 */
async function frameworkRecRows(year: number | string | null, country: string, commodity: string) {
  let q = supabaseAdmin
    .from('project_mf_values')
    .select('period_end, total, project_mf_indicators!inner(project_id, indicator_code, cumulative, projects!inner(country, commodity))')
    .in('project_mf_indicators.indicator_code', ['REC01', 'REC02', 'REC03', 'REC04', 'REC05'])
  if (year)      q = (q as any).like('period_end', `${year}-%`)
  if (country)   q = (q as any).eq('project_mf_indicators.projects.country',   country)
  if (commodity) q = (q as any).eq('project_mf_indicators.projects.commodity', commodity)
  const { data } = await q
  const latest: Record<string, any> = {}
  const out: any[] = []
  for (const r of (data ?? []) as any[]) {
    if (r.total == null) continue
    const ind = r.project_mf_indicators
    const row = { survey_year: Number(r.period_end.slice(0, 4)), rec_code: ind.indicator_code, count: Number(r.total), projects: ind.projects, period_end: r.period_end }
    if (ind.cumulative === true) {
      const k = `${ind.project_id}:${ind.indicator_code}:${row.survey_year}`
      if (!latest[k] || r.period_end > latest[k].period_end) latest[k] = row
    } else out.push(row)
  }
  return [...out, ...Object.values(latest)]
}

export default async function DashboardPage({ searchParams }: Props) {
  const sp        = await searchParams
  const year      = sp.year      ? parseInt(sp.year, 10) : null
  const country   = sp.country   ?? ''
  const commodity = sp.commodity ?? ''

  // ── Query each KPI view, joined to projects for country/commodity ─────────

  async function queryKpi(view: string) {
    let q = supabaseAdmin
      .from(view)
      .select(`*, projects!inner(project_code, country, commodity)`)
    if (year)      q = (q as any).eq('survey_year', year)
    if (country)   q = (q as any).eq('projects.country', country)
    if (commodity) q = (q as any).eq('projects.commodity', commodity)
    const { data } = await q
    return data ?? []
  }

  const [s61, s62, s21, s25, s63, s64, s65, summaryRaw, outputRaw, recRaw] = await Promise.all([
    queryKpi('v_s61_kpi'),
    queryKpi('v_s62_kpi'),
    queryKpi('v_s21_kpi'),
    queryKpi('v_s25_kpi'),
    queryKpi('v_s63_kpi'),
    queryKpi('v_s64_kpi'),
    queryKpi('v_s65_kpi'),
    // Summary view
    (async () => {
      let q = supabaseAdmin.from('v_kpi_summary').select('*')
      if (year)      q = q.eq('survey_year', year)
      if (country)   q = q.eq('country', country as any)
      if (commodity) q = q.eq('commodity', commodity as any)
      const { data } = await q
      return data ?? []
    })(),
    // Farmers trained / reached — cumulative to date, from each project's measurement framework:
    // the one indicator per project tagged network_kpi = 'farmers_trained' in its dashboard_input
    // sheet (Sprint 42), with progress worked out as on the /targets scorecard. With a year
    // selected: cumulative to the end of that year.
    (async () => {
      const upTo = year ? `${year}-12` : undefined
      const vcols = 'period_end, cumulative, total, male, female, youth'
      let q = supabaseAdmin
        .from('project_mf_sheet_values')
        .select(`project_id, indicator_id, ${vcols}, eop_total, eop_male, eop_female, eop_youth, overall_total, projects!inner(project_code, project_name, country, commodity)`)
        .eq('network_kpi', 'farmers_trained')
      if (country)   q = (q as any).eq('projects.country',   country)
      if (commodity) q = (q as any).eq('projects.commodity', commodity)
      // SAVE (KE-SVP-001) keeps its framework in save_mf_indicator_values
      let sq = supabaseAdmin.from('project_mf_sheets').select('project_id, projects!inner(project_code, project_name, country, commodity)')
        .eq('source_table', 'save_mf_indicator_values')
      if (country)   sq = (sq as any).eq('projects.country',   country)
      if (commodity) sq = (sq as any).eq('projects.commodity', commodity)
      const [{ data }, { data: saveLink }] = await Promise.all([q, sq])
      const groups: Record<string, { rows: FrameworkValueRow[]; projects: any }> = {}
      for (const r of (data ?? []) as any[]) {
        const k = `${r.project_id}:${r.indicator_id}`;
        (groups[k] ??= { rows: [], projects: r.projects }).rows.push(r)
      }
      if (saveLink?.length) {
        const { data: save } = await supabaseAdmin.from('save_mf_indicator_values')
          .select(`indicator_id, ${vcols}`).eq('network_kpi', 'farmers_trained')
        for (const r of (save ?? []) as any[]) {
          const k = `save:${r.indicator_id}`;
          (groups[k] ??= { rows: [], projects: (saveLink[0] as any).projects }).rows.push(r)
        }
      }
      // timeline: cumulative to the end of each year, from the first framework year to the selected / current year
      const lastYear = year ?? new Date().getFullYear()
      return Object.values(groups).flatMap(g => {
        const p = indicatorProgress(g.rows, upTo)
        if (!p) return []
        const points: Record<string, number | null> = {}
        for (let y = FIRST_FARMER_YEAR; y <= lastYear; y++) points[y] = indicatorProgress(g.rows, `${y}-12`)?.total ?? null
        return [{ farmers_trained: p.total, female_count: p.female, male_count: p.male, youth_count: p.youth,
                  projects: g.projects, points }]
      })
    })(),
    // REC records — responsible economy KPI counts, recorded as framework indicators
    // REC01–REC05 in each project's Measurement Framework (Sprint 28)
    frameworkRecRows(year, country, commodity),
  ])

  // ── Aggregate totals ──────────────────────────────────────────────────────

  function sum(rows: any[], col: string) {
    return rows.reduce((acc: number, r: any) => acc + (Number(r[col]) || 0), 0)
  }
  function recSum(code: string) {
    return recRaw.filter((r: any) => r.rec_code === code).reduce((a: number, r: any) => a + (Number(r.count) || 0), 0)
  }

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
      count:           sum(s64, 'companies_count'),
      farmersRewarded: sum(s64, 'total_farmers_rewarded'),
    },
    s65: {
      code: 'S6.5', label: 'Companies with responsible procurement',
      pathway: 'Market',
      count: sum(s65, 'companies_count'),
      tier2: sum(s65, 'tier2_count'),
      tier3: sum(s65, 'tier3_count'),
    },
    // REC Level Indicators (direct count, manually entered)
    rec01: { code: 'REC01', label: 'Processors with reduced pollution',              pathway: 'Production', count: recSum('REC01') },
    rec02: { code: 'REC02', label: 'Workers under improved working conditions',      pathway: 'Production', count: recSum('REC02') },
    rec03: { code: 'REC03', label: 'Green jobs created',                             pathway: 'Services',   count: recSum('REC03') },
    rec04: { code: 'REC04', label: 'CSOs with enhanced capacity in policy processes', pathway: 'Governance', count: recSum('REC04') },
    rec05: { code: 'REC05', label: 'Farmers receiving premium prices',               pathway: 'Market',     count: recSum('REC05') },
  }

  // ── Output KPI totals (farmers trained — direct headcount) ───────────────
  const outputTotal  = sum(outputRaw, 'farmers_trained')
  const outputFemale = sum(outputRaw, 'female_count')
  const outputMale   = sum(outputRaw, 'male_count')
  const outputYouth  = sum(outputRaw, 'youth_count')
  // per-project series for the farmers-reached timeline (drop-down = projects)
  const farmerSeries = outputRaw.map((r: any) => ({
    code: r.projects?.project_code ?? '', name: r.projects?.project_name ?? '', points: r.points,
    total: Number(r.farmers_trained) || 0, female: Number(r.female_count) || 0, male: Number(r.male_count) || 0,
  })).sort((a: any, b: any) => a.code.localeCompare(b.code))

  // ── Country breakdown ─────────────────────────────────────────────────────
  const byCountry = COUNTRIES.map(c => {
    const rows    = summaryRaw.filter((r: any) => r.country === c)
    const recRows = recRaw.filter((r: any) => (r.projects as any)?.country === c)
    function rc(code: string) {
      return recRows.filter((r: any) => r.rec_code === code).reduce((a: number, r: any) => a + (Number(r.count) || 0), 0)
    }
    return {
      country:       c,
      s61_count:     sum(rows, 's61_count'),
      s62_count:     sum(rows, 's62_count'),
      s21_count:     sum(rows, 's21_count'),
      s25_count:     sum(rows, 's25_count'),
      s63_count:     sum(rows, 's63_count'),
      s64_companies: sum(rows, 's64_companies'),
      s65_companies: sum(rows, 's65_companies'),
      rec01_count:   rc('REC01'),
      rec02_count:   rc('REC02'),
      rec03_count:   rc('REC03'),
      rec04_count:   rc('REC04'),
      rec05_count:   rc('REC05'),
    }
  })

  // ── Year trend data (TrendChart — S6.1/S6.2/S2.1) ───────────────────────
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

  // ── Per-KPI 5-year trend bars ─────────────────────────────────────────────
  const CHART_YEARS = [2026, 2027, 2028, 2029, 2030]
  const KPI_CODES   = ['S6.1','S6.2','S2.1','S2.5','S6.3','S6.4','S6.5','REC01','REC02','REC03','REC04','REC05']

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

  const recTrendQuery = frameworkRecRows('', country, commodity).then(data => ({ data }))

  const [{ data: targetsRaw }, { data: achAllRaw }, { data: recTrendRaw }] = await Promise.all([
    targetsQuery, achAllQuery, recTrendQuery,
  ])

  // Sum targets per kpi_code × year
  const tgtSums: Record<string, Record<number, number>> = {}
  for (const r of targetsRaw ?? []) {
    if (!tgtSums[r.kpi_code]) tgtSums[r.kpi_code] = {}
    tgtSums[r.kpi_code][r.survey_year] = (tgtSums[r.kpi_code][r.survey_year] || 0) + r.target_total
  }

  // Achievement sums per KPI × year
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
  for (const r of recTrendRaw ?? []) {
    const y    = r.survey_year
    const code = r.rec_code
    achSums[code][y] = (achSums[code][y] || 0) + (Number(r.count) || 0)
  }

  // Build trend arrays aligned to CHART_YEARS
  const kpiTrends: Record<string, { year: number; target: number; achievement: number }[]> =
    Object.fromEntries(KPI_CODES.map(code => [
      code,
      CHART_YEARS.map(y => ({
        year:        y,
        target:      tgtSums[code]?.[y] || 0,
        achievement: achSums[code]?.[y] || 0,
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
      farmerSeries={farmerSeries}
      currentYear={year ? String(year) : ''}
      currentCountry={country}
      currentCommodity={commodity}
      countries={COUNTRIES}
      commodities={COMMODITIES}
    />
  )
}
