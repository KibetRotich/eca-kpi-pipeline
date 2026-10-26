'use client'

/**
 * Google-Sheet measurement framework inside a project's window on /targets
 * (Sprint 29) — the same view as tab "8 · Measurement Framework" of the SAVE KE
 * Seedlings Distribution dashboard: progress scorecard, progress graphs and the
 * embedded, editable Google Sheet. Values come from the nightly sheet sync
 * (save_mf_indicator_values), so this page and tab 8 always show the same numbers.
 * The logic mirrors pipeline/save_seedlings/build_dashboard.py (section 8).
 */
import { useState } from 'react'
import { Bar, Chart, Doughnut, Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, ArcElement, BarElement, LineElement, PointElement,
         BarController, LineController, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, ArcElement, BarElement, LineElement, PointElement, BarController, LineController, Tooltip, Legend)

export interface SheetRow {
  indicator_id: string; period_end: string; level: string | null; indicator: string; unit: string | null
  baseline: number | null; end_target: number | null; cumulative: boolean | null
  total: number | null; male: number | null; female: number | null; youth: number | null
  survival_pct: number | null; note: string | null; period_label?: string | null
  network_kpi?: string | null   // e.g. 'farmers_trained' — counted on Network KPIs (Sprint 42)
  target_direct?: number | null; non_individual?: number | null
  // end-of-project figure reported by the sheet (KE-CSV-001): the project total when yearly figures overlap
  eop_total?: number | null; eop_male?: number | null; eop_female?: number | null; eop_youth?: number | null
  // overall achievement so far reported by the sheet (UG-HAR-001): progress where given
  overall_total?: number | null
}
export interface SheetLink {
  sheet_id: string; gid: number; tab: string; label: string | null; synced_at: string | null
  cadence?: '6-monthly' | 'annual'
  county_order?: string[]
  counties?: { county: string; indicator_id: string; period_end: string; total: number | null; male: number | null
               female: number | null; youth: number | null; non_individual: number | null }[]
  rows: SheetRow[]
  reference?: { indicator_id: string; label: string; series: { period_end: string; value: number }[] }
  reached?: { farmers_reached: number; women: number; men: number; gender_other: number
              youth: number; non_youth: number; not_in_register: number } | null
}

/** Donut with % + count in every legend label (colours as on the Seedlings Summary dashboard). */
function Donut({ parts }: { parts: [string, number, string][] }) {
  const p = parts.filter(x => x[1] > 0)
  const tot = p.reduce((a, x) => a + x[1], 0)
  const lab = (x: [string, number, string]) => `${x[0]} — ${tot ? ((x[1] / tot) * 100).toFixed(1) : 0}% (${x[1].toLocaleString()})`
  return (
    <Doughnut data={{ labels: p.map(lab), datasets: [{ data: p.map(x => x[1]), backgroundColor: p.map(x => x[2]), borderColor: '#fff', borderWidth: 2 }] }}
      options={{ responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: { legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 10, padding: 6, color: '#222' } },
                   tooltip: { callbacks: { label: c => ` ${c.label}` } } } }} />
  )
}

const fmt = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString())
const plab6 = (pe: string) => new Date(`${pe}-01T00:00:00`).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
const nowYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const card = { background: '#fff', border: '1px solid #e8e0a0', padding: '.5rem .6rem' }
const small = { fontSize: '.52rem', color: '#888' }
const lineOpts = (pct = false): any => ({
  responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
  plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
  scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 }, callback: (v: any) => (pct ? `${v}%` : Number(v).toLocaleString()) } } },
})

/** Achievement per year (bars) + cumulative achievement (line) + end target (dashed), with an indicator picker. */
function YearChart({ title, axis, label, points, target, options, value, onPick, height = 230, note, running = true, eop = null,
                     eopLabel = 'end-of-project achievement' }: {
  title: string; axis: string[]; label: (p: string) => string; points: Record<string, number>; target: number | null
  options: { id: string; name: string }[]; value: string; onPick: (id: string) => void; height?: number; note?: string
  running?: boolean; eop?: number | null; eopLabel?: string
}) {
  let run = 0
  const last = Object.keys(points).sort().slice(-1)[0] ?? ''
  const cum = axis.map(p => { if (points[p] != null) run += points[p]; return p <= last ? run : null })
  const sets: any[] = [
    { type: 'bar', label: running ? 'achievement in the year' : 'reported value', data: axis.map(p => points[p] ?? null), backgroundColor: '#FFC800', borderRadius: 4, order: 3 },
  ]
  // values that are already running totals or rates (cumulative = Y) are not added up
  if (running) sets.push({ type: 'line', label: 'cumulative achievement', data: cum, borderColor: '#2e7d32', backgroundColor: '#2e7d32', pointRadius: 3, spanGaps: true, order: 1 })
  if (eop != null) sets.push({ type: 'line', label: `${eopLabel} (${eop.toLocaleString()})`, data: axis.map((_, i) => (i === axis.length - 1 ? eop : null)),
                               borderColor: '#6a1b9a', backgroundColor: '#6a1b9a', pointRadius: 6, pointStyle: 'rectRot', showLine: false, order: 0 })
  if (target != null) sets.push({ type: 'line', label: `end target (${target.toLocaleString()})`, data: axis.map(() => target),
                                   borderColor: '#1565c0', borderDash: [6, 4], pointRadius: 0, order: 2 })
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.6rem', fontWeight: 700 }}>{title}</span>
        <select value={value} onChange={e => onPick(e.target.value)} style={{ fontSize: '.56rem', marginLeft: 'auto', maxWidth: 260 }}>
          {options.map(o => <option key={o.id} value={o.id}>{o.id} — {o.name}</option>)}
        </select>
      </div>
      <div style={{ height }}>
        <Chart type="bar" data={{ labels: axis.map(label), datasets: sets }}
          options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
            scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: (v: any) => Number(v).toLocaleString() } } } }} />
      </div>
      {note && <div style={small}>{note}</div>}
    </div>
  )
}

export default function SheetFramework({ sheet }: { sheet: SheetLink }) {
  const annual = sheet.cadence === 'annual'
  const plab = (pe: string) => (annual ? pe.slice(0, 4) : plab6(pe))     // annual frameworks label periods by year
  const [pick, setPick] = useState('')
  const [countyPick, setCountyPick] = useState<Record<string, string>>({})   // per-county indicator override
  const rows = [...sheet.rows].map(r => ({ ...r, total: r.total == null ? null : Number(r.total) }))
  const ids = [...new Set(rows.map(r => r.indicator_id))].sort()
  const byId = (id: string) => rows.filter(r => r.indicator_id === id).sort((a, b) => a.period_end.localeCompare(b.period_end))
  const now = nowYM()

  // ── scorecard: latest value for running totals, sum of periods for per-period indicators ──
  const score = ids.map(id => {
    const g = byId(id), rep = g.filter(r => r.total != null)
    const tgt = Math.max(...g.map(r => (r.end_target == null ? -1 : Number(r.end_target))))
    const direct = Math.max(...g.map(r => (r.target_direct == null ? -1 : Number(r.target_direct))))
    const cum = g.map(r => r.cumulative).filter(c => c != null) as boolean[]
    const perPeriod = cum.length > 0 && !cum.some(Boolean)
    let prog: number | null = null, when = 'not yet reported', how = ''
    const eopRow = g.find(r => r.eop_total != null)
    const overallRow = g.find(r => r.overall_total != null)
    if (eopRow) {                                        // the sheet's end-of-project figure wins (yearly figures may overlap)
      prog = Number(eopRow.eop_total); when = `end of project (${plab(g[g.length - 1].period_end)})`; how = 'EoP achievement from the sheet'
    } else if (overallRow) {                             // the sheet's own overall figure (may differ from the sum of the years)
      const lastPe = (rep.length ? rep : g)[(rep.length ? rep : g).length - 1].period_end
      prog = Number(overallRow.overall_total); when = `overall to ${plab(lastPe)}`; how = 'overall achievement from the sheet'
      if (lastPe > now) when += annual ? ' (provisional — year not yet ended)' : ' (provisional — period not yet ended)'
    } else if (rep.length && perPeriod) {
      prog = rep.reduce((a, r) => a + (r.total as number), 0); when = `sum to ${plab(rep[rep.length - 1].period_end)}`; how = 'sum of periods'
    } else if (rep.length) {
      const last = rep[rep.length - 1]
      prog = last.total; when = plab(last.period_end); how = cum.length ? '' : 'latest — confirm cumulative/per-period'
      if (last.period_end > now) when += annual ? ' (provisional — year not yet ended)' : ' (provisional — period not yet ended)'
    }
    const pct = prog != null && tgt > 0 ? Math.round((prog / tgt) * 1000) / 10 : null
    const notes = [...new Set(g.map(r => r.note).filter(Boolean))].join('; ')
    return { id, g, level: g[0]?.level ?? '', indicator: g[0]?.indicator ?? id, unit: g[0]?.unit ?? '', tgt: tgt > 0 ? tgt : null,
             direct: direct > 0 && direct !== tgt ? direct : null, prog, when, how, pct, notes, perPeriod,
             running: !cum.some(Boolean), eop: eopRow ? Number(eopRow.eop_total) : null, eopRow,
             overall: overallRow ? Number(overallRow.overall_total) : null }
  })

  // A framework with end-of-project figures (KE-CSV-001) lists only those indicators in the scorecard,
  // not the ones whose progress is a partial sum to an earlier year; the charts keep every indicator.
  const cardRows = score.some(s => s.eop != null) ? score.filter(s => s.eop != null) : score
  // one progress column per year / period, up to the last period with any reported value
  // (all of the framework's periods while nothing has been reported yet)
  const lastRep = rows.filter(r => r.total != null).map(r => r.period_end).sort().slice(-1)[0] ?? ''
  const cardPeriods = [...new Set(rows.map(r => r.period_end))].sort().filter(p => !lastRep || p <= lastRep)
  const periodName = (p: string) => {
    const l = rows.find(r => r.period_end === p && r.period_label)?.period_label
    return l ? l.replace(/ \(annual\)$/, '').replace(/^P\d+ /, '') : plab(p)
  }

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
    .sort((a, b) => (b.prog ?? 0) - (a.prog ?? 0))
    .filter(s => { const k = JSON.stringify(series(s.id)); if (seen.includes(k)) return false; seen.push(k); return true }).slice(0, 2)
  // Graph 4 — gender and youth of farmers reached (profiled register x Kobo distributions)
  const rc = sheet.reached ? Object.fromEntries(Object.entries(sheet.reached).map(([k, v]) => [k, Number(v) || 0])) as Record<string, number> : null
  // No register data: take gender / youth from the framework itself - the people indicator with the
  // largest progress that has a male / female breakdown (summed over periods, or latest if a running total).
  const head = rc ? null : score.filter(s => /farmer|people|worker|member/i.test(s.unit) && s.g.some(r => r.male != null && r.female != null && Number(r.total) > 0))
    .sort((a, b) => (b.prog ?? 0) - (a.prog ?? 0))[0]
  const hb = head ? (() => {
    const rp = head.g.filter(r => r.total != null && r.male != null)
    const use = head.perPeriod ? rp : rp.slice(-1)
    const sum = (k: 'male' | 'female' | 'youth' | 'non_individual' | 'total') => use.reduce((a, r) => a + (Number((r as any)[k]) || 0), 0)
    const m = sum('male'), f = sum('female'), y = sum('youth'), ni = sum('non_individual'), t = sum('total')
    return { m, f, y, ni, other: Math.max(0, t - m - f - ni), span: use.length > 1 ? `${plab(use[0].period_end)}–${plab(use[use.length - 1].period_end)}` : plab(use[0].period_end) }
  })() : null
  const pickId = pick || [...score].sort((a, b) => (b.prog ?? 0) - (a.prog ?? 0))[0]?.id || ''
  const pickRows = byId(pickId).filter(r => r.total != null)

  const hasCounties = (sheet.counties?.length ?? 0) > 0
  // Annual frameworks (P2P Kenya / Tanzania) use the progress-per-year layout; counties are added when present
  const yearLayout = hasCounties || annual
  const opts = score.map(s => ({ id: s.id, name: short(s.indicator).slice(0, 70) }))
  const yearAxis = [...new Set(rows.map(r => r.period_end))].sort()
  const mainId = pick || [...score].sort((a, b) => (b.prog ?? 0) - (a.prog ?? 0))[0]?.id || ''
  const mainInd = score.find(s => s.id === mainId)
  const pointsOf = (id: string) => series(id)
  const countyPoints = (county: string, id: string) => Object.fromEntries((sheet.counties ?? [])
    .filter(r => r.county === county && r.indicator_id === id && r.total != null).map(r => [r.period_end, Number(r.total)]))
  // running totals (cumulative = Y): the latest year with a male / female split, not the sum of all years
  const gall = mainInd ? mainInd.g.filter(r => r.total != null) : []
  const gsplit = gall.filter(r => r.male != null || r.female != null)
  const gsel = mainInd && !mainInd.running ? gall : gsplit.length ? gsplit.slice(-1) : gall.slice(-1)
  const gsum = (k: 'male' | 'female' | 'non_individual' | 'total') => gsel.reduce((a, r) => a + (Number((r as any)[k]) || 0), 0)
  // with an EoP gender split in the sheet, the pie shows it instead of adding up overlapping years
  const eg = mainInd?.eopRow?.eop_male != null && mainInd?.eopRow?.eop_female != null ? mainInd.eopRow : null
  const gm = eg ? Number(eg.eop_male) : gsum('male'), gf = eg ? Number(eg.eop_female) : gsum('female')
  const gni = eg ? 0 : gsum('non_individual'), gt = eg ? Number(eg.eop_total) : gsum('total')

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
        {/* Fixed layout: Indicator takes ~a fifth of the width so the progress and % columns get the room */}
        <table style={{ fontSize: '.62rem', minWidth: 720, width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '22%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} />
            {cardPeriods.map(p => <col key={p} />)}
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead><tr>
            <th style={{ textAlign: 'left' }}>Indicator</th><th style={{ textAlign: 'left' }}>Level</th>
            <th style={{ textAlign: 'right' }}>End target</th>
            {cardPeriods.map((p, k) => (
              <th key={p} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                Progress {annual ? 'year' : 'period'} {k + 1}<div style={{ ...small, fontWeight: 400 }}>{periodName(p)}</div>
              </th>
            ))}
            <th style={{ textAlign: 'right' }}>% of target</th>
          </tr></thead>
          <tbody>
            {cardRows.map((s, i) => {
              const c = s.pct == null ? '' : s.pct >= 100 ? '#c8e6c9' : s.pct >= 50 ? '#fff3cd' : '#f8d7da'
              const bar = s.pct == null ? '' : s.pct >= 100 ? '#2e7d32' : s.pct >= 50 ? '#FFC800' : '#e65100'
              const byPe = Object.fromEntries(s.g.filter(r => r.total != null).map(r => [r.period_end, r.total as number]))
              return (
                <tr key={s.id} style={{ background: i % 2 ? '#fafafa' : '#fff', verticalAlign: 'top' }}>
                  <td style={{ overflowWrap: 'anywhere' }}><b>{s.id}</b> {s.indicator}
                    {s.g.some(r => r.network_kpi === 'farmers_trained') && <div style={{ ...small, color: '#2e7d32', fontWeight: 700 }}>✓ Counts toward Network KPIs: farmers trained / reached</div>}
                    {s.notes && <div style={{ ...small, color: '#8a6d00' }}>⚠ {s.notes}</div>}</td>
                  <td>{s.level}</td>
                  <td style={{ textAlign: 'right' }}>{s.tgt == null ? '–' : `${fmt(s.tgt)} ${s.unit}`}{s.direct != null && <div style={small}>direct {fmt(s.direct)}</div>}</td>
                  {cardPeriods.map(p => <td key={p} style={{ textAlign: 'right' }}>{fmt(byPe[p])}</td>)}
                  <td style={{ textAlign: 'right', background: c }}>
                    {s.pct == null ? '–' : `${s.pct.toFixed(1)}%`}
                    {s.prog != null && <div style={small}>{fmt(s.prog)} {s.how === 'sum of periods' ? 'in total' : s.how ? s.how.replace(' from the sheet', '') : 'latest'}</div>}
                    {s.pct != null && <div style={{ background: '#eee', borderRadius: 4, height: 6, marginTop: 2 }}><div style={{ width: `${Math.min(100, s.pct)}%`, height: 6, borderRadius: 4, background: bar }} /></div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ ...small, marginTop: 4 }}>
          Each progress column is the value reported for that {annual ? 'year' : 'period'}: the achievement in the {annual ? 'year' : 'period'} for
          per-period indicators, or the running total at that point for indicators the sheet marks as cumulative. % of target uses the
          sum of the {annual ? 'years' : 'periods'} for per-period indicators, the latest value for running totals, and the sheet’s own end-of-project
          or overall figure where it gives one (shown under the %). Bars are capped at 100% of the end target; the % shows the true figure.
          {cardRows.length < score.length && ` Only the ${cardRows.length} indicators with an end-of-project figure are listed; the other ${score.length - cardRows.length} are in the progress chart’s drop-down.`}
        </div>
      </div>

      {/* Progress graphs — county layout (P2P): overall per-year chart, one per county, gender pie last */}
      {yearLayout && mainInd && (<>
        {/* Row 1: overall progress per year and the gender pie, side by side (half width each) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '.6rem' }}>
          <YearChart title={`Progress per year — ${hasCounties ? 'all counties' : 'project'}`} axis={yearAxis} label={plab} height={220}
            points={pointsOf(mainId)} target={mainInd.tgt} options={opts} value={mainId} onPick={id => { setPick(id); setCountyPick({}) }}
            running={mainInd.running} eop={mainInd.eop ?? mainInd.overall}
            eopLabel={mainInd.eop != null ? 'end-of-project achievement' : 'overall achievement so far'}
            note={`Bars: ${mainInd.running ? `achievement in each ${annual ? 'year' : 'period'}. Green line: running total` : 'value reported (already a running total or rate, so not added up)'}.${mainInd.eop != null ? ' Purple: end-of-project achievement from the sheet, the project total where yearly figures overlap.' : mainInd.overall != null ? ' Purple: the sheet’s overall achievement so far, used as progress.' : ''} Dashed: Direct end target${mainInd.tgt == null ? ' (none set for this indicator)' : ''}.`} />
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Gender — {short(mainInd.indicator)}</div>
            <div style={{ height: 220 }}>
              <Donut parts={[['Women', gf, '#d81b60'], ['Men', gm, '#1565c0'],
                             ['Non-individual (co-ops, companies…)', gni, '#9e9e9e'], ['Not disaggregated', Math.max(0, gt - gm - gf - gni), '#d8d8d8']]} />
            </div>
            <div style={small}>{eg ? 'End-of-project figure from the sheet' : mainInd.running ? `All reported ${annual ? 'years' : 'periods'}` : `Running total as of ${gsel[0] ? plab(gsel[0].period_end) : '–'}`} for the indicator selected in the progress chart.</div>
          </div>
        </div>
        {/* Then one chart per county */}
        {hasCounties && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '.6rem' }}>
          {(sheet.county_order ?? []).map(county => {
            const cid = countyPick[county] || mainId
            return (
              <YearChart key={county} title={county} axis={yearAxis} label={plab} height={190}
                points={countyPoints(county, cid)} target={null} options={opts} value={cid}
                onPick={id => setCountyPick(cp => ({ ...cp, [county]: id }))} />
            )
          })}
        </div>
        <div style={small}>
          County charts show achievement as entered in each county tab; there are no county targets in the sheet. County figures do not
          always add up to the project totals in the indicator tracking table — check the county tabs where they differ.
        </div>
        </>)}
      </>)}

      {!yearLayout && (
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
        {rc && rc.farmers_reached > 0 && (<>
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Gender of farmers reached</div>
            <div style={{ height: 210 }}>
              <Donut parts={[['Women', rc.women, '#d81b60'], ['Men', rc.men, '#1565c0'],
                             ['Other / not stated', rc.gender_other, '#9e9e9e'], ['Not in register', rc.not_in_register, '#d8d8d8']]} />
            </div>
            <div style={small}>{rc.farmers_reached.toLocaleString()} farmers reached, all rounds. Gender from the profiled-farmer register (matched on beneficiary ID).</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Youth of farmers reached</div>
            <div style={{ height: 210 }}>
              <Donut parts={[['Youth', rc.youth, '#e65100'], ['Non-youth', rc.non_youth, '#6b6b6b'], ['Not in register', rc.not_in_register, '#d8d8d8']]} />
            </div>
            <div style={small}>Age group from the profiled-farmer register; the distribution form does not record gender or age.</div>
          </div>
        </>)}
        {!rc && head && hb && (<>
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Gender — {short(head.indicator)}</div>
            <div style={{ height: 210 }}>
              <Donut parts={[['Women', hb.f, '#d81b60'], ['Men', hb.m, '#1565c0'],
                             ['Non-individual (co-ops, companies…)', hb.ni, '#9e9e9e'], ['Not disaggregated', hb.other, '#d8d8d8']]} />
            </div>
            <div style={small}>{head.perPeriod ? 'Sum of' : 'Latest'} reported values, {hb.span}. From the framework male / female columns.</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: '.6rem', fontWeight: 700 }}>Youth — {short(head.indicator)}</div>
            <div style={{ height: 210 }}>
              <Donut parts={[['Youth', hb.y, '#e65100'], ['Non-youth', Math.max(0, hb.m + hb.f - hb.y), '#6b6b6b']]} />
            </div>
            <div style={small}>Individuals only (men + women), {hb.span}. Youth overlaps men / women.</div>
          </div>
        </>)}
        {!ref && pickRows.length > 0 && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span style={{ fontSize: '.6rem', fontWeight: 700 }}>Values by {annual ? 'year' : 'period'}</span>
              <select value={pickId} onChange={e => setPick(e.target.value)} style={{ fontSize: '.56rem', marginLeft: 'auto', maxWidth: 230 }}>
                {score.map(s => <option key={s.id} value={s.id}>{s.id} — {short(s.indicator)}</option>)}
              </select>
            </div>
            <div style={{ height: 210 }}>
              <Bar options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
                  scales: { x: { stacked: true, ticks: { font: { size: 9 } } }, y: { stacked: true, ticks: { font: { size: 9 } } } } }}
                data={{ labels: pickRows.map(r => plab(r.period_end)), datasets: [
                  { label: 'female', data: pickRows.map(r => Number(r.female) || 0), backgroundColor: '#d81b60', borderRadius: 3 },
                  { label: 'male', data: pickRows.map(r => Number(r.male) || 0), backgroundColor: '#1565c0', borderRadius: 3 },
                  { label: 'non-individual / not disaggregated', data: pickRows.map(r => Math.max(0, Number(r.total) - (Number(r.female) || 0) - (Number(r.male) || 0))), backgroundColor: '#bdbdbd', borderRadius: 3 }] }} />
            </div>
            <div style={small}>Each bar is the value reported for that {annual ? 'year' : 'period'}.</div>
          </div>
        )}
      </div>
      )}

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
