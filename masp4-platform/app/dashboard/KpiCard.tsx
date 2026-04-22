'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface TrendPoint { year: number; target: number; achievement: number }

interface KpiProps {
  kpi: {
    code:     string
    label:    string
    pathway:  string
    count:    number
    estimated?:  boolean
    sampleSize?: number
    samplePct?:  number
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
  trend: TrendPoint[]
}

function DisaggBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '.3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.62rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 2 }}>
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

function KpiBarChart({ trend, color }: { trend: TrendPoint[]; color: string }) {
  const labels = trend.map(r => `'${String(r.year).slice(2)}`)

  const hasAny = trend.some(r => r.target > 0 || r.achievement > 0)
  if (!hasAny) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#ccc', fontSize: '.58rem', textAlign: 'center', lineHeight: 1.6 }}>
        No targets or data yet
      </div>
    )
  }

  const data = {
    labels,
    datasets: [
      {
        label: 'Annual Target',
        data: trend.map(r => r.target),
        backgroundColor: '#111111',
        borderRadius: 0,
        categoryPercentage: 0.75,
        barPercentage: 0.55,
      },
      {
        label: 'Achievement',
        data: trend.map(r => r.achievement),
        backgroundColor: '#FFC800',
        borderRadius: 0,
        categoryPercentage: 0.75,
        barPercentage: 0.55,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { family: 'Open Sans', size: 9 },
          boxWidth: 10,
          padding: 8,
          color: '#555',
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Open Sans', size: 9 }, color: '#888' },
      },
      y: {
        beginAtZero: true,
        grid: { color: '#f5f5f5' },
        ticks: {
          font: { family: 'Open Sans', size: 9 },
          color: '#aaa',
          precision: 0,
          maxTicksLimit: 4,
          callback: (v: any) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v,
        },
      },
    },
  }

  return <Bar data={data} options={options as any} />
}

export default function KpiCard({ kpi, color, trend }: KpiProps) {
  const textOnYellow = color === '#FFC800' ? '#000' : '#fff'
  const hasDisagg    = kpi.female !== undefined
  const hasTiers     = kpi.tier2  !== undefined

  return (
    <div className="cc" style={{ borderTop: `3px solid ${color}`, padding: 0, overflow: 'hidden' }}>

      {/* Top section — headline number + disaggregation */}
      <div style={{ padding: '.5rem .7rem .4rem' }}>

        {/* Code badge + title + headline count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.6rem' }}>
          <div>
            <span style={{
              display: 'inline-block',
              background: color, color: textOnYellow,
              fontSize: '.58rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '.8px',
              padding: '.1rem .4rem', marginBottom: '.3rem',
            }}>
              {kpi.code}
            </span>
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#333', lineHeight: 1.3, maxWidth: 130 }}>
              {kpi.label}
            </div>
          </div>
          <div style={{ textAlign: 'right', marginLeft: '.5rem', flexShrink: 0 }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {kpi.count.toLocaleString()}
            </div>
            {kpi.estimated && kpi.sampleSize != null && (
              <div style={{ fontSize: '.5rem', marginTop: 3, lineHeight: 1.4, textAlign: 'right' }}>
                <span style={{
                  background: '#FFC800', color: '#000',
                  fontSize: '.46rem', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '.5px',
                  padding: '.05rem .3rem', display: 'inline-block', marginBottom: 2,
                }}>Achievement</span>
                <div style={{ color: '#888' }}>
                  from {kpi.sampleSize.toLocaleString()} sampled
                  {kpi.samplePct != null && <span> ({kpi.samplePct}%)</span>}
                </div>
              </div>
            )}
            {!kpi.estimated && kpi.sampleSize != null && (
              <div style={{ fontSize: '.5rem', color: '#aaa', marginTop: 2, lineHeight: 1.3, textAlign: 'right' }}>
                {kpi.sampleSize.toLocaleString()} sampled (no target set)
              </div>
            )}
          </div>
        </div>

        {/* Disaggregation bars */}
        {hasDisagg && kpi.count > 0 && (
          <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.45rem', marginTop: '.2rem' }}>
            <DisaggBar value={kpi.female!} max={kpi.count} color="#FFC800" label="Female"    />
            <DisaggBar value={kpi.male!}   max={kpi.count} color="#111"    label="Male"      />
            {kpi.youth !== undefined && (
              <DisaggBar value={kpi.youth} max={kpi.count} color="#888"    label="Youth ≤35" />
            )}
          </div>
        )}

        {/* Tier breakdown */}
        {hasTiers && kpi.count > 0 && (
          <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.45rem', marginTop: '.2rem' }}>
            <DisaggBar value={kpi.tier2!} max={kpi.count} color={color}  label="Tier 2 — adopted"     />
            <DisaggBar value={kpi.tier3!} max={kpi.count} color="#555"   label="Tier 3 — implemented" />
          </div>
        )}

        {/* Extra stats */}
        {kpi.avgIndex && (
          <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.65rem', color: '#888' }}>
            Avg index: <strong style={{ color: '#111' }}>{kpi.avgIndex}</strong>
            <span style={{ color: '#bbb' }}> / {kpi.code === 'S6.1' ? '35' : '30'}</span>
          </div>
        )}
        {kpi.farmersRewarded !== undefined && (
          <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.65rem', color: '#888' }}>
            Farmers rewarded: <strong style={{ color: '#111' }}>{kpi.farmersRewarded.toLocaleString()}</strong>
          </div>
        )}
        {kpi.farmerOwners !== undefined && (
          <div style={{ borderTop: '1px solid #f2f2f2', paddingTop: '.4rem', marginTop: '.4rem', fontSize: '.65rem', color: '#888', display: 'flex', gap: '1rem' }}>
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

      {/* Bar chart — Target vs Achievement across 5 years */}
      <div style={{ borderTop: '1px solid #f0f0f0', padding: '.3rem .5rem .4rem', height: 110 }}>
        <KpiBarChart trend={trend} color={color} />
      </div>

    </div>
  )
}
