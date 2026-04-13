'use client'

interface KpiProps {
  kpi: {
    code:     string
    label:    string
    pathway:  string
    count:    number
    female?:  number
    male?:    number
    youth?:   number
    tier2?:   number
    tier3?:   number
    avgIndex?: string | null
    farmersRewarded?: number
    farmerOwners?: number
    spOwners?: number
  }
  color: string
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--grey-5)', marginBottom: '.15rem' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{value.toLocaleString()} <span style={{ fontWeight: 400, color: 'var(--grey-3)' }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, background: 'var(--grey-1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

export default function KpiCard({ kpi, color }: KpiProps) {
  const hasDisagg = kpi.female !== undefined || kpi.male !== undefined
  const hasTiers  = kpi.tier2  !== undefined

  return (
    <div style={{
      background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      padding: '1.1rem 1.25rem', borderLeft: `4px solid ${color}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.75rem' }}>
        <div>
          <span style={{
            display: 'inline-block', background: color + '18', color,
            borderRadius: 4, padding: '.1rem .45rem', fontSize: '.75rem', fontWeight: 700,
            marginBottom: '.3rem',
          }}>
            {kpi.code}
          </span>
          <div style={{ fontSize: '.875rem', fontWeight: 600, lineHeight: 1.3 }}>{kpi.label}</div>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, marginLeft: '.5rem', flexShrink: 0 }}>
          {kpi.count.toLocaleString()}
        </div>
      </div>

      {/* Disaggregation bars — production/services KPIs */}
      {hasDisagg && kpi.count > 0 && (
        <div style={{ marginTop: '.5rem' }}>
          <Bar value={kpi.female!} max={kpi.count} color="#9333ea" label="Female" />
          <Bar value={kpi.male!}   max={kpi.count} color="#0284c7" label="Male"   />
          {kpi.youth !== undefined && (
            <Bar value={kpi.youth} max={kpi.count} color="#0891b2" label="Youth (≤35)" />
          )}
        </div>
      )}

      {/* Tier breakdown — governance/market KPIs */}
      {hasTiers && kpi.count > 0 && (
        <div style={{ marginTop: '.5rem' }}>
          <Bar value={kpi.tier2!} max={kpi.count} color={color} label="Tier 2 (adopted)" />
          <Bar value={kpi.tier3!} max={kpi.count} color={color + 'bb'} label="Tier 3 (implemented)" />
        </div>
      )}

      {/* Extra metrics */}
      {kpi.avgIndex && (
        <div style={{ marginTop: '.65rem', fontSize: '.8rem', color: 'var(--grey-5)', borderTop: '1px solid var(--grey-1)', paddingTop: '.5rem' }}>
          Avg. index score: <strong style={{ color }}>{kpi.avgIndex}</strong>
          <span style={{ color: 'var(--grey-3)' }}> / {kpi.code === 'S6.1' ? '35' : '30'}</span>
        </div>
      )}

      {kpi.farmersRewarded !== undefined && (
        <div style={{ marginTop: '.65rem', fontSize: '.8rem', color: 'var(--grey-5)', borderTop: '1px solid var(--grey-1)', paddingTop: '.5rem' }}>
          Farmers rewarded: <strong style={{ color }}>{kpi.farmersRewarded.toLocaleString()}</strong>
        </div>
      )}

      {kpi.farmerOwners !== undefined && (
        <div style={{ marginTop: '.65rem', fontSize: '.8rem', color: 'var(--grey-5)', borderTop: '1px solid var(--grey-1)', paddingTop: '.5rem', display: 'flex', gap: '1rem' }}>
          <span>Farmers: <strong>{kpi.farmerOwners}</strong></span>
          <span>Service providers: <strong>{kpi.spOwners}</strong></span>
        </div>
      )}

      {/* Zero state */}
      {kpi.count === 0 && (
        <div style={{ fontSize: '.8rem', color: 'var(--grey-3)', marginTop: '.25rem' }}>
          No approved data yet
        </div>
      )}
    </div>
  )
}
