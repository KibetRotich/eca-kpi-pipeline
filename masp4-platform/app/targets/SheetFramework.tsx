'use client'

/**
 * Google-Sheet measurement framework inside a project's window on /targets
 * (Sprint 29) — the same view as tab "8 · Measurement Framework" of the SAVE KE
 * Seedlings Distribution dashboard: progress scorecard, progress graphs and the
 * embedded, editable Google Sheet. Values come from the nightly sheet sync
 * (save_mf_indicator_values), so this page and tab 8 always show the same numbers.
 * The logic mirrors pipeline/save_seedlings/build_dashboard.py (section 8).
 */
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

export interface SheetRow {
  indicator_id: string; period_end: string; level: string | null; indicator: string; unit: string | null
  baseline: number | null; end_target: number | null; cumulative: boolean | null
  total: number | null; male: number | null; female: number | null; youth: number | null
  survival_pct: number | null; note: string | null
}
export interface SheetLink {
  sheet_id: string; gid: number; tab: string; label: string | null; synced_at: string | null
  rows: SheetRow[]
  reference?: { indicator_id: string; label: string; series: { period_end: string; value: number }[] }
}

const fmt = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString())
const plab = (pe: string) => new Date(`${pe}-01T00:00:00`).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
const nowYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const card = { background: '#fff', border: '1px solid #e8e0a0', padding: '.5rem .6rem' }
const small = { fontSize: '.52rem', color: '#888' }
const lineOpts = (pct = false): any => ({
  responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
  plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
  scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 }, callback: (v: any) => (pct ? `${v}%` : Number(v).toLocaleString()) } } },
})

export default function SheetFramework({ sheet }: { sheet: SheetLink }) {
  const rows = [...sheet.rows].map(r => ({ ...r, total: r.total == null ? null : Number(r.total) }))
  const ids = [...new Set(rows.map(r => r.indicator_id))].sort()
  const byId = (id: string) => rows.filter(r => r.indicator_id === id).sort((a, b) => a.period_end.localeCompare(b.period_end))
  const now = nowYM()

  // ── scorecard: latest value for running totals, sum of periods for per-period indicators ──
  const score = ids.map(id => {
    const g = byId(id), rep = g.filter(r => r.total != null)
    const tgt = Math.max(...g.map(r => (r.end_target == null ? -1 : Number(r.end_target))))
    const cum = g.map(r => r.cumulative).filter(c => c != null) as boolean[]
    const perPeriod = cum.length > 0 && !cum.some(Boolean)
    let prog: number | null = null, when = 'not yet reported', how = ''
    if (rep.length && perPeriod) {
      prog = rep.reduce((a, r) => a + (r.total as number), 0); when = `sum to ${plab(rep[rep.length - 1].period_end)}`; how = 'sum of periods'
    } else if (rep.length) {
      const last = rep[rep.length - 1]
      prog = last.total; when = plab(last.period_end); how = cum.length ? '' : 'latest — confirm cumulative/per-period'
      if (last.period_end > now) when += ' (provisional — period not yet ended)'
    }
    const pct = prog != null && tgt > 0 ? Math.round((prog / tgt) * 1000) / 10 : null
    const notes = [...new Set(g.map(r => r.note).filter(Boolean))].join('; ')
    return { id, g, level: g[0]?.level ?? '', indicator: g[0]?.indicator ?? id, unit: g[0]?.unit ?? '', tgt: tgt > 0 ? tgt : null, prog, when, how, pct, notes }
  })

  const reported = rows.filter(r => r.total != null).map(r => r.period_end)
  const last = reported.length ? reported.sort().slice(-1)[0] : ''
  const axis = [...new Set(rows.map(r => r.period_end))].sort().filter(p => p <= last)
  const series = (id: string) => Object.fromEntries(byId(id).filter(r => r.total != null).map(r => [r.period_end, r.total as number]))
  const tgtOf = (id: string) => score.find(s => s.id === id)?.tgt ?? null
  const short = (t: string) => t.replace(/^# of /, '').split(' (')[0]

  // Graph 1 — the indicator with a reference series (trees planted vs Kobo seedlings distributed)
  const ref = sheet.reference && ids.includes(sheet.reference.indicator_id) ? sheet.reference : undefined
  const refInd = ref ? score.find(s => s.id === ref.indicator_id) : undefined
  // Graph 2 — reported rates (survival %)
  const rateRows = rows.filter(r => r.survival_pct != null).sort((a, b) => a.period_end.localeCompare(b.period_end))
  // Graph 3 — people indicators vs targets (series identical to an earlier one are skipped)
  const seen: string[] = []
  const people = score.filter(s => /farmer|people/i.test(s.unit) && byId(s.id).filter(r => r.total != null).length >= 2)
    .filter(s => { const k = JSON.stringify(series(s.id)); if (seen.includes(k)) return false; seen.push(k); return true }).slice(0, 2)
  // Graph 4 — gender split, latest period with a breakdown per indicator
  const gl = ids.map(id => byId(id).filter(r => r.male != null && r.female != null).slice(-1)[0]).filter(Boolean) as SheetRow[]

  const src = `https://docs.google.com/spreadsheets/d/${sheet.sheet_id}/edit?gid=${sheet.gid}&rm=minimal`
  const link = `https://docs.google.com/spreadsheets/d/${sheet.sheet_id}/edit#gid=${sheet.gid}`

  return (
    <div style={{ padding: '0 .9rem .7rem', display: 'grid', gap: '.6rem' }}>
      <div style={{ fontSize: '.6rem', color: '#555' }}>
        Logframe KPIs against end-of-project targets, from the <b>{sheet.label ?? 'project M&E framework'}</b> (Google Sheet, tab <code>{sheet.tab}</code>).
        Values are updated by the M&E team in the sheet below and refresh here and on the Seedlings dashboard nightly
        {sheet.synced_at ? ` (last loaded ${sheet.synced_at.slice(0, 10)})` : ''}.
      </div>

      {/* Scorecard */}
      <div style={{ ...card, overflowX: 'auto' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, marginBottom: '.35rem' }}>Progress against end-of-project targets</div>
        <table style={{ fontSize: '.62rem', minWidth: 720 }}>
          <thead><tr>
            <th style={{ textAlign: 'left' }}>Indicator</th><th style={{ textAlign: 'left' }}>Level</th>
            <th style={{ textAlign: 'right' }}>End target</th><th style={{ textAlign: 'right' }}>Progress</th>
            <th style={{ textAlign: 'left' }}>As of</th><th style={{ textAlign: 'right' }}>% of target</th><th style={{ width: 140 }} />
          </tr></thead>
          <tbody>
            {score.map((s, i) => {
              const c = s.pct == null ? '' : s.pct >= 100 ? '#c8e6c9' : s.pct >= 50 ? '#fff3cd' : '#f8d7da'
              const bar = s.pct == null ? '' : s.pct >= 100 ? '#2e7d32' : s.pct >= 50 ? '#FFC800' : '#e65100'
              return (
                <tr key={s.id} style={{ background: i % 2 ? '#fafafa' : '#fff', verticalAlign: 'top' }}>
                  <td><b>{s.id}</b> {s.indicator}{s.notes && <div style={{ ...small, color: '#8a6d00' }}>⚠ {s.notes}</div>}</td>
                  <td>{s.level}</td>
                  <td style={{ textAlign: 'right' }}>{s.tgt == null ? '–' : `${fmt(s.tgt)} ${s.unit}`}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(s.prog)}</td>
                  <td>{s.when}{s.how && <div style={small}>{s.how}</div>}</td>
                  <td style={{ textAlign: 'right', background: c }}>{s.pct == null ? '–' : `${s.pct.toFixed(1)}%`}</td>
                  <td>{s.pct != null && <div style={{ background: '#eee', borderRadius: 4, height: 10 }}><div style={{ width: `${Math.min(100, s.pct)}%`, height: 10, borderRadius: 4, background: bar }} /></div>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ ...small, marginTop: 4 }}>
          Progress = latest reported value for running totals; sum of periods where the sheet marks the indicator as per-period
          (cumulative = N). Bars are capped at 100% of the end target; the % shows the true figure.
        </div>
      </div>

      {/* Progress graphs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '.6rem' }}>
        {refInd && ref && (
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>{short(refInd.indicator)} vs end target (with {ref.label.split(' (')[0]})</div>
            <div style={{ height: 210 }}>
              <Line options={lineOpts()} data={{ labels: axis.map(plab), datasets: [
                { label: `${short(refInd.indicator)} (logframe)`, data: axis.map(p => series(refInd.id)[p] ?? null), borderColor: '#FFC800', backgroundColor: '#FFC800', spanGaps: true, pointRadius: 3 },
                { label: ref.label, data: axis.map(p => ref.series.find(x => x.period_end === p)?.value ?? null), borderColor: '#2e7d32', backgroundColor: '#2e7d32', spanGaps: true, pointRadius: 3 },
                { label: 'end target', data: axis.map(() => refInd.tgt), borderColor: '#1565c0', borderDash: [6, 4], pointRadius: 0 },
              ] }} />
            </div>
            <div style={small}>Distributed counts come from the Kobo distribution form, cut at each reporting month; planted counts are as reported in the framework.</div>
          </div>
        )}
        {rateRows.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Reported tree survival rate (%)</div>
            <div style={{ height: 210 }}>
              <Line options={lineOpts(true)} data={{ labels: rateRows.map(r => plab(r.period_end)), datasets: [
                { label: 'survival rate %', data: rateRows.map(r => Number(r.survival_pct)), borderColor: '#FFC800', backgroundColor: '#FFC800', pointRadius: 3 }] }} />
            </div>
            <div style={small}>From the “{short(rows.find(r => r.survival_pct != null)?.indicator ?? '')}” indicator.</div>
          </div>
        )}
        {people.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>{people.map(p => short(p.indicator)).join(' and ')} vs targets</div>
            <div style={{ height: 210 }}>
              <Line options={lineOpts()} data={{ labels: axis.map(plab), datasets: people.flatMap((p, k) => [
                { label: short(p.indicator), data: axis.map(x => series(p.id)[x] ?? null), borderColor: ['#FFC800', '#2e7d32'][k], backgroundColor: ['#FFC800', '#2e7d32'][k], spanGaps: true, pointRadius: 3 },
                { label: `target (${fmt(p.tgt)})`, data: axis.map(() => p.tgt), borderColor: ['#1565c0', '#e65100'][k], borderDash: [6, 4], pointRadius: 0 },
              ]) }} />
            </div>
            <div style={small}>Values as reported each period. Whether these are running totals is set by the sheet’s cumulative column.</div>
          </div>
        )}
        {gl.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Gender split — latest period with a breakdown</div>
            <div style={{ height: 210 }}>
              <Bar options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
                  scales: { x: { stacked: true, ticks: { font: { size: 8 } } }, y: { stacked: true, ticks: { font: { size: 9 } } } } }}
                data={{ labels: gl.map(r => `${short(r.indicator).slice(0, 34)} (${plab(r.period_end)})`), datasets: [
                  { label: 'male', data: gl.map(r => Number(r.male)), backgroundColor: '#1565c0', borderRadius: 3 },
                  { label: 'female', data: gl.map(r => Number(r.female)), backgroundColor: '#d81b60', borderRadius: 3 }] }} />
            </div>
            <div style={small}>Youth counts overlap male/female and are shown in the sheet.</div>
          </div>
        )}
      </div>

      {/* Editable sheet */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
          <span style={{ fontSize: '.62rem', fontWeight: 700 }}>Update values — {sheet.label ?? 'M&E framework'} (tab: {sheet.tab})</span>
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.58rem', marginLeft: 'auto' }}>Open the sheet in Google Sheets ↗</a>
        </div>
        <iframe src={src} title={`${sheet.label ?? 'M&E framework'} — ${sheet.tab}`} loading="lazy"
          style={{ width: '100%', height: 620, border: '1px solid #d8d8d8', borderRadius: 6, background: '#fff' }} />
        <div style={{ ...small, marginTop: 4 }}>
          Edit the yellow columns (total, male, female, youth, survival %) and set cumulative = Y (running total) or N (per period).
          Editing needs Google access to the sheet; changes appear here and on the Seedlings dashboard after the nightly refresh.
        </div>
      </div>
    </div>
  )
}
