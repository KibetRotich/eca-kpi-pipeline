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

const COUNTRIES   = ['Kenya','Uganda','Tanzania','Ethiopia','Congo']
const COMMODITIES = ['Coffee','Cocoa','Cotton','Tea','Soy','Sugar','Palm','F&V','Other']

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

  const [s61, s62, s21, s25, s63, s64, s65, summaryRaw] = await Promise.all([
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
  ])

  // ── Aggregate totals ──────────────────────────────────────────────────────

  function sum(rows: any[], col: string) {
    return rows.reduce((acc: number, r: any) => acc + (Number(r[col]) || 0), 0)
  }

  const kpis = {
    s61: {
      code: 'S6.1', label: 'Farmers with enhanced resilience',
      pathway: 'Production',
      count:  sum(s61, 'resilience_count'),
      female: sum(s61, 'count_female'),
      male:   sum(s61, 'count_male'),
      youth:  sum(s61, 'count_youth'),
      avgIndex: s61.length ? (s61.reduce((a: number, r: any) => a + Number(r.avg_index || 0), 0) / s61.length).toFixed(1) : null,
    },
    s62: {
      code: 'S6.2', label: 'Farmers with improved farm viability',
      pathway: 'Production',
      count:  sum(s62, 'viability_count'),
      female: sum(s62, 'count_female'),
      male:   sum(s62, 'count_male'),
      youth:  sum(s62, 'count_youth'),
      avgIndex: s62.length ? (s62.reduce((a: number, r: any) => a + Number(r.avg_index || 0), 0) / s62.length).toFixed(1) : null,
    },
    s21: {
      code: 'S2.1', label: 'Farmers accessing new/improved services',
      pathway: 'Services',
      count:  sum(s21, 'services_count'),
      female: sum(s21, 'count_female'),
      male:   sum(s21, 'count_male'),
      youth:  sum(s21, 'count_youth'),
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

  // ── Year trend data ────────────────────────────────────────────────────────
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

  return (
    <DashboardClient
      kpis={kpis}
      byCountry={byCountry}
      trendByYear={trendByYear}
      currentYear={year ? String(year) : ''}
      currentCountry={country}
      currentCommodity={commodity}
      countries={COUNTRIES}
      commodities={COMMODITIES}
    />
  )
}
