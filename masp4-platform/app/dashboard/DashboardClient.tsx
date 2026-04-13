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
  Production: '#FFC800',
  Services:   '#1a3557',
  Governance: '#e65100',
  Market:     '#2e7d32',
}

const YEARS = ['2025','2026','2027','2028','2029','2030']

export default function DashboardClient({
  kpis, byCountry, trendByYear,
  currentYear, currentCountry, currentCommodity,
  countries, commodities,
}: Props) {
  const router = useRouter()

  function nav(params: Record<string, string>) {
    const sp = new URLSearchParams({ year: currentYear, country: currentCountry, commodity: currentCommodity, ...params })
    for (const [k, v] of [...sp.entries()]) { if (!v) sp.delete(k) }
    router.push('/dashboard?' + sp.toString())
  }

  const totalFarmers   = kpis.s61.count + kpis.s62.count + kpis.s21.count
  const totalFemale    = kpis.s61.female + kpis.s62.female + kpis.s21.female
  const totalYouth     = kpis.s61.youth  + kpis.s62.youth  + kpis.s21.youth
  const totalCompanies = kpis.s64.count  + kpis.s65.count

  const summaryCards = [
    { label: 'Total farmers reached',   value: totalFarmers,         color: '#FFC800', textColor: '#000' },
    { label: 'Female farmers',          value: totalFemale,          color: '#1a3557', textColor: '#fff' },
    { label: 'Youth farmers (≤35)',      value: totalYouth,           color: '#e65100', textColor: '#fff' },
    { label: 'Companies engaged',        value: totalCompanies,       color: '#2e7d32', textColor: '#fff' },
    { label: 'Regulations improved',     value: kpis.s63.count,       color: '#111',    textColor: '#fff' },
  ]

  return (
    <div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', border: '1px solid #d0d0d0',
        padding: '.45rem .75rem', marginBottom: '.9rem',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.45rem 1rem',
      }}>
        <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#666' }}>
          Filter:
        </span>
        {[
          { label: 'Year',      value: currentYear,      opts: YEARS,      key: 'year',      placeholder: 'All years' },
          { label: 'Country',   value: currentCountry,   opts: countries,  key: 'country',   placeholder: 'All countries' },
          { label: 'Commodity', value: currentCommodity, opts: commodities, key: 'commodity', placeholder: 'All commodities' },
        ].map(({ label, value, opts, key, placeholder }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={value}
                onChange={e => nav({ [key]: e.target.value })}
                style={{ paddingRight: '1.4rem', minWidth: 120 }}
              >
                <option value="">{placeholder}</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
            </div>
          </div>
        ))}

        {(currentYear || currentCountry || currentCommodity) && (
          <button className="btn-secondary" onClick={() => nav({ year: '', country: '', commodity: '' })} style={{ marginLeft: 'auto' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Summary banner */}
      <div className="g5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '.8rem', marginBottom: '.9rem' }}>
        {summaryCards.map(({ label, value, color, textColor }) => (
          <div key={label} className="cc" style={{ borderTop: `3px solid ${color}`, padding: '.75rem .9rem' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>
              {value.toLocaleString()}
            </div>
            <div style={{ fontSize: '.54rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* KPI cards grouped by pathway */}
      {(['Production','Services','Governance','Market'] as const).map(pathway => {
        const cards = Object.values(kpis).filter((k: any) => k.pathway === pathway)
        if (!cards.length) return null
        const color = PATHWAY_COLORS[pathway]
        return (
          <div key={pathway} style={{ marginBottom: '.9rem' }}>
            <div className="s-hdr">
              <div className="s-hdr-bar" style={{ background: color }} />
              <span className="s-hdr-text">{pathway}</span>
              <span className="s-hdr-tag" style={{ background: color === '#FFC800' ? '#FFC800' : '#111', color: color === '#FFC800' ? '#000' : '#fff' }}>
                {cards.length} indicator{cards.length > 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '.8rem' }}>
              {cards.map((k: any) => <KpiCard key={k.code} kpi={k} color={color} />)}
            </div>
          </div>
        )
      })}

      {/* Country table + trend chart */}
      <div className="g2" style={{ marginTop: '.9rem' }}>
        <CountryTable byCountry={byCountry} />
        <TrendChart trendByYear={trendByYear} />
      </div>

    </div>
  )
}
