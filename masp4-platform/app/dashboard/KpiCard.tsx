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
    <div style={{ marginBottom: '.3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.54rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: '#222', fontVariantNumeric: 'tabular-nums' }}>
          {value.toLocaleString()} <span style={{ color: '#bbb', fontWeight: 400 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 5, background: '#f0f0f0', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

export default function KpiCard({ kpi, color }: KpiProps) {
  const textOnYellow = color === '#FFC800' ? '#000' : '#fff'
  const hasDisagg    = kpi.female !== undefined
  const hasTiers     = kpi.tier2  !== undefined

  return (
    <div className="cc" style={{ borderTop: `3px solid ${color}` }}>

      {/* Code badge + title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.6rem' }}>
        <div>
          <span style={{
            display: 'inline-block',
            background: color, color: textOnYellow,
            fontSize: '.5rem', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.8px',
            padding: '.1rem .4rem', marginBottom: '.3rem',
          }}>
            {kpi.code}
          </span>
          <div style={{ fontSize: '.6rem', fontWeight: 700, color: '#333', lineHeight: 1.3, maxWidth: 160 }}>
            {kpi.label}
          </div>
        </div>
        <div style={{
          fontSize: '1.6rem', fontWeight: 800, color: '#111',
          lineHeight: 1, marginLeft: '.5rem', flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {kpi.count.toLocaleString()}
        </div>
      </div>

      {/* Disaggregation bars */}
      {hasDisagg && kpi.count > 0 && (
        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.45rem', marginTop: '.2rem' }}>
          <Bar value={kpi.female!} max={kpi.count} color="#1a3557" label="Female"     />
          <Bar value={kpi.male!}   max={kpi.count} color="#888"    label="Male"       />
          {kpi.youth !== undefined && (
            <Bar value={kpi.youth} max={kpi.count} color="#e65100" label="Youth ≤35"  />
          )}
        </div>
      )}

      {/* Tier breakdown */}
      {hasTiers && kpi.count > 0 && (
        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.45rem', marginTop: '.2rem' }}>
          <Bar value={kpi.tier2!} max={kpi.count} color={color}  label="Tier 2 — adopted"       />
          <Bar value={kpi.tier3!} max={kpi.count} color="#555"   label="Tier 3 — implemented"   />
        </div>
      )}

      {/* Extra stats */}
      {kpi.avgIndex && (
        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.58rem', color: '#888' }}>
          Avg index: <strong style={{ color: '#111' }}>{kpi.avgIndex}</strong>
          <span style={{ color: '#bbb' }}> / {kpi.code === 'S6.1' ? '35' : '30'}</span>
        </div>
      )}
      {kpi.farmersRewarded !== undefined && (
        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.58rem', color: '#888' }}>
          Farmers rewarded: <strong style={{ color: '#111' }}>{kpi.farmersRewarded.toLocaleString()}</strong>
        </div>
      )}
      {kpi.farmerOwners !== undefined && (
        <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.58rem', color: '#888', display: 'flex', gap: '1rem' }}>
          <span>Farmers: <strong style={{ color: '#111' }}>{kpi.farmerOwners}</strong></span>
          <span>SPs: <strong style={{ color: '#111' }}>{kpi.spOwners}</strong></span>
        </div>
      )}

      {kpi.count === 0 && (
        <div style={{ fontSize: '.58rem', color: '#bbb', fontStyle: 'italic', marginTop: '.2rem' }}>
          No approved data yet
        </div>
      )}
    </div>
  )
}
