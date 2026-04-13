'use client'

import { useRouter } from 'next/navigation'
import KpiCard from './KpiCard'
import CountryTable from './CountryTable'
import TrendChart from './TrendChart'

interface Props {
  kpis:             Record<string, any>
  byCountry:        any[]
  trendByYear:      any[]
  currentYear:      string
  currentCountry:   string
  currentCommodity: string
  countries:        string[]
  commodities:      string[]
}

const PATHWAY_COLORS: Record<string, string> = {
  Production: '#1a6b3c',
  Services:   '#1d4ed8',
  Governance: '#7c3aed',
  Market:     '#b45309',
}

const YEARS = ['2025','2026','2027','2028','2029','2030']

export default function DashboardClient({
  kpis, byCountry, trendByYear,
  currentYear, currentCountry, currentCommodity,
  countries, commodities,
}: Props) {
  const router = useRouter()

  function nav(params: Record<string, string>) {
    const sp = new URLSearchParams({
      year:      currentYear,
      country:   currentCountry,
      commodity: currentCommodity,
      ...params,
    })
    // Remove empty params
    for (const [k, v] of sp.entries()) { if (!v) sp.delete(k) }
    router.push('/dashboard?' + sp.toString())
  }

  const totalFarmers = kpis.s61.count + kpis.s62.count + kpis.s21.count
  const totalCompanies = kpis.s64.count + kpis.s65.count

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700 }}>MASP IV KPI Dashboard</h1>
          <p style={{ color: 'var(--grey-5)', fontSize: '.875rem', marginTop: '.2rem' }}>
            Solidaridad East & Central Africa · 2025–2030
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '.65rem', flexWrap: 'wrap' }}>
          <select value={currentYear} onChange={e => nav({ year: e.target.value })}>
            <option value="">All years</option>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={currentCountry} onChange={e => nav({ country: e.target.value })}>
            <option value="">All countries</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={currentCommodity} onChange={e => nav({ commodity: e.target.value })}>
            <option value="">All commodities</option>
            {commodities.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Summary banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        {[
          { label: 'Total farmers reached', value: totalFarmers.toLocaleString(), color: 'var(--green)' },
          { label: 'Female farmers', value: (kpis.s61.female + kpis.s62.female + kpis.s21.female).toLocaleString(), color: '#9333ea' },
          { label: 'Youth farmers', value: (kpis.s61.youth + kpis.s62.youth + kpis.s21.youth).toLocaleString(), color: '#0284c7' },
          { label: 'Companies engaged', value: totalCompanies.toLocaleString(), color: 'var(--amber)' },
          { label: 'Regulations improved', value: kpis.s63.count.toLocaleString(), color: '#7c3aed' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
            padding: '1rem 1.25rem', borderTop: `3px solid ${color}`,
          }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--grey-5)', marginTop: '.3rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* KPI cards — grouped by pathway */}
      {(['Production','Services','Governance','Market'] as const).map(pathway => {
        const pathwayKpis = Object.values(kpis).filter((k: any) => k.pathway === pathway)
        if (pathwayKpis.length === 0) return null
        return (
          <div key={pathway} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', marginBottom: '.75rem' }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: PATHWAY_COLORS[pathway] }} />
              <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--grey-5)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {pathway}
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {pathwayKpis.map((k: any) => (
                <KpiCard key={k.code} kpi={k} color={PATHWAY_COLORS[pathway]} />
              ))}
            </div>
          </div>
        )
      })}

      {/* Bottom row: country table + trend chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1rem' }}>
        <CountryTable byCountry={byCountry} />
        <TrendChart trendByYear={trendByYear} />
      </div>
    </div>
  )
}
