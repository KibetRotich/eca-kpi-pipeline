'use client'

/**
 * Farmers trained / reached by year with a project drop-down, and the gender split of the same
 * selection (pie). Green line: cumulative achievement built from the yearly values; yellow line:
 * cumulative yearly targets (projects that have them). Figures come from each project's measurement
 * framework (the indicator tagged network_kpi = 'farmers_trained'). The headline number is the
 * scorecard total, which uses the sheet's end-of-project / overall figure where there is one.
 */
import { useState } from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler)

export interface FarmerSeries {
  code: string; name: string; points: Record<string, number | null>; targets: Record<string, number | null>
  total: number; female: number; male: number
}

const card = { background: '#fff', border: '1px solid #d0d0d0', borderTop: '3px solid #FFC800', padding: '.5rem .7rem' }
const small = { fontSize: '.55rem', color: '#888' }

export default function FarmersTimeline({ series, total, female, male, youth }: {
  series: FarmerSeries[]; total: number; female: number; male: number; youth: number
}) {
  const [pick, setPick] = useState('')
  const sel = pick ? series.filter(s => s.code === pick) : series
  const years = Object.keys(series[0]?.points ?? {}).sort()
  // a project counts from its first reported year; before that it adds nothing
  const add = (k: 'points' | 'targets') => years.map(y => {
    const v = sel.map(s => s[k]?.[y]).filter(x => x != null) as number[]
    return v.length ? v.reduce((a, b) => a + b, 0) : null
  })
  const values = add('points'), targets = add('targets')
  const noTarget = sel.filter(s => !Object.values(s.targets ?? {}).some(v => v != null)).map(s => s.code)
  const t = pick ? sel[0]?.total ?? 0 : total
  const f = pick ? sel[0]?.female ?? 0 : female
  const m = pick ? sel[0]?.male ?? 0 : male
  const other = Math.max(0, t - f - m)
  const pie = [['Women', f, '#d81b60'], ['Men', m, '#1565c0'], ['Not disaggregated', other, '#d8d8d8']] as [string, number, string][]
  const shown = pie.filter(p => p[1] > 0)
  const pct = (v: number) => (t ? `${((v / t) * 100).toFixed(1)}%` : '–')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: '.6rem', marginBottom: '.7rem' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>{t.toLocaleString()}</span>
          <span style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888' }}>
            Farmers trained / reached (cumulative)
          </span>
          <select value={pick} onChange={e => setPick(e.target.value)} style={{ fontSize: '.6rem', marginLeft: 'auto', maxWidth: 260 }}>
            <option value="">All projects ({series.length})</option>
            {series.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
          </select>
        </div>
        <div style={{ height: 170, marginTop: '.35rem' }}>
          <Line data={{ labels: years, datasets: [
                { label: 'Achieved (cumulative)', data: values, borderColor: '#2e7d32', backgroundColor: '#2e7d32',
                  pointRadius: 3, spanGaps: true, tension: .2 },
                { label: 'Target (cumulative)', data: targets, borderColor: '#FFC800', backgroundColor: '#FFC800',
                  pointRadius: 3, spanGaps: true, tension: .2 }] }}
            options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
              plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 9 }, boxWidth: 10 } },
                tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${Number(c.parsed.y).toLocaleString()}` } } },
              scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                        y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 10 }, callback: v => Number(v).toLocaleString() } } } }} />
        </div>
        <div style={small}>
          Green: achievement to the end of each year, built from the yearly figures of each project&rsquo;s measurement
          framework (the indicator marked &ldquo;Counts toward Network KPIs&rdquo; on Projects&rsquo; Progress). Yellow: the
          yearly targets added up. The headline number uses the sheet&rsquo;s end-of-project or overall figure where there is one,
          so it can differ from the last green point.
          {noTarget.length > 0 && ` No yearly targets for: ${noTarget.join(', ')} (achievements only).`}
        </div>
      </div>
      <div style={card}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888' }}>
          Gender{pick ? ` — ${pick}` : ''}
        </div>
        <div style={{ height: 150 }}>
          {shown.length ? (
            <Doughnut data={{ labels: shown.map(p => `${p[0]} ${pct(p[1])}`), datasets: [{ data: shown.map(p => p[1]), backgroundColor: shown.map(p => p[2]), borderColor: '#fff', borderWidth: 2 }] }}
              options={{ responsive: true, maintainAspectRatio: false, cutout: '58%',
                plugins: { legend: { position: 'right', labels: { font: { size: 9 }, boxWidth: 10 } },
                           tooltip: { callbacks: { label: c => ` ${c.label} (${Number(c.parsed).toLocaleString()})` } } } }} />
          ) : <div style={{ ...small, fontStyle: 'italic', paddingTop: '2rem' }}>No figures reported yet.</div>}
        </div>
        <div style={small}>
          {f.toLocaleString()} women · {m.toLocaleString()} men{!pick && youth ? ` · ${youth.toLocaleString()} youth (overlaps)` : ''}
        </div>
      </div>
    </div>
  )
}
