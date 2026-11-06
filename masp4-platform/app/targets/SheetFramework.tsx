'use client'

/**
 * Google-Sheet measurement framework inside a project's window on /targets
 * (Sprint 29) — the same view as tab "8 · Measurement Framework" of the SAVE KE
 * Seedlings Distribution dashboard: progress scorecard and the embedded, editable
 * Google Sheet (progress graphs removed from /targets on 2026-11-06 at the user's request). Values come from the nightly sheet sync
 * (save_mf_indicator_values), so this page and tab 8 always show the same numbers.
 * The logic mirrors pipeline/save_seedlings/build_dashboard.py (section 8).
 */

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

const fmt = (n: number | null | undefined) => (n == null ? '–' : Number(n).toLocaleString())
const plab6 = (pe: string) => new Date(`${pe}-01T00:00:00`).toLocaleString('en-GB', { month: 'short', year: 'numeric' })
const nowYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const card = { background: '#fff', border: '1px solid #e8e0a0', padding: '.5rem .6rem' }
const small = { fontSize: '.52rem', color: '#888' }

export default function SheetFramework({ sheet }: { sheet: SheetLink }) {
  const annual = sheet.cadence === 'annual'
  const plab = (pe: string) => (annual ? pe.slice(0, 4) : plab6(pe))     // annual frameworks label periods by year
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
  // not the ones whose progress is a partial sum to an earlier year.
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
          {cardRows.length < score.length && ` Only the ${cardRows.length} indicators with an end-of-project figure are listed; the other ${score.length - cardRows.length} are in the sheet below.`}
        </div>
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
