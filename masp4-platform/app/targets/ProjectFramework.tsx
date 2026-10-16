'use client'

/**
 * Measurement Framework for one project (Sprint 28) — shown inside a project's
 * window on /targets, replacing the old quarterly OUTPUT and REC sections.
 *
 * Each project defines its own logframe indicators (level, unit, baseline,
 * end-of-project target, yearly targets, cumulative Y/N) and records values every
 * 6 months (June / December) with total / female / male / youth.
 * Reads and writes /api/framework; editing needs an M&E Officer or Admin role.
 */
import { useState, useEffect, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import SheetFramework, { type SheetLink } from './SheetFramework'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const YEARS = [2026, 2027, 2028, 2029, 2030]
const LEVELS = ['Goal', 'Outcome', 'Output']

type Annual = Record<string, { total?: number; female?: number; male?: number }>
interface Indicator {
  id: string; indicator_code: string; level: string | null; indicator: string; unit: string | null
  baseline: number | null; end_target: number | null; annual_targets: Annual
  cumulative: boolean | null; sort_order: number; source: string | null
}
interface Value {
  id: string; indicator_id: string; period_end: string
  total: number | null; female: number | null; male: number | null; youth: number | null; notes: string | null
}

const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString())
const plab = (pe: string) => `${pe.endsWith('-06') ? 'Jun' : 'Dec'} ${pe.slice(0, 4)}`
const thisPeriodEnd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/** Progress to date: latest value for running totals, sum of periods for per-period indicators. */
function progress(ind: Indicator, vals: Value[]) {
  const rep = vals.filter(v => v.total != null).sort((a, b) => a.period_end.localeCompare(b.period_end))
  if (!rep.length) return { value: null as number | null, asOf: '' }
  if (ind.cumulative === false) return { value: rep.reduce((a, v) => a + Number(v.total), 0), asOf: plab(rep[rep.length - 1].period_end) }
  const last = rep[rep.length - 1]
  return { value: Number(last.total), asOf: plab(last.period_end) }
}

/** Achievement within one year: sum of Jun + Dec for per-period, December (else June) for running totals. */
function yearValue(ind: Indicator, vals: Value[], year: string) {
  const yr = vals.filter(v => v.period_end.startsWith(year) && v.total != null)
  if (!yr.length) return null
  if (ind.cumulative === false) return yr.reduce((a, v) => a + Number(v.total), 0)
  return Number(yr.sort((a, b) => b.period_end.localeCompare(a.period_end))[0].total)
}

const emptyInd = { id: '', indicator_code: '', level: 'Output', indicator: '', unit: '', baseline: '', end_target: '',
  cumulative: '' as '' | 'Y' | 'N', annual: {} as Record<string, { total: string; female: string; male: string }> }
const emptyVal = { total: '', female: '', male: '', youth: '', notes: '' }

export default function ProjectFramework({ projectId, year, canEdit }: { projectId: string; year: string; canEdit: boolean }) {
  const [inds, setInds] = useState<Indicator[]>([])
  const [vals, setVals] = useState<Value[]>([])
  const [sheet, setSheet] = useState<SheetLink | null>(null)   // linked Google-Sheet framework (Sprint 29)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [indForm, setIndForm] = useState<typeof emptyInd | null>(null)   // add / edit indicator
  const [valEdit, setValEdit] = useState<{ indicator_id: string; period_end: string } | null>(null)
  const [valForm, setValForm] = useState(emptyVal)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [chartInd, setChartInd] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch(`/api/framework?project_id=${projectId}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Could not load the framework')
      setInds(j.indicators ?? []); setVals(j.values ?? []); setSheet(j.sheet ?? null)
    } catch (e: any) { setErr(e.message) }
    finally { setLoading(false) }
  }, [projectId])
  useEffect(() => { load() }, [load])

  const periods = [`${year}-06`, `${year}-12`]
  const now = thisPeriodEnd()
  const valsOf = (id: string) => vals.filter(v => v.indicator_id === id)

  async function send(method: 'POST' | 'DELETE', body?: object, qs = '') {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/framework${qs}`, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      const j = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? 'Save failed' }); return false }
      setMsg({ ok: true, text: 'Saved' }); await load(); return true
    } catch { setMsg({ ok: false, text: 'Network error' }); return false }
    finally { setBusy(false) }
  }

  function openIndicator(ind?: Indicator) {
    setMsg(null)
    if (!ind) { setIndForm({ ...emptyInd, annual: {} }); return }
    const annual: typeof emptyInd.annual = {}
    for (const y of YEARS) {
      const t = ind.annual_targets?.[String(y)]
      annual[y] = { total: t?.total != null ? String(t.total) : '', female: t?.female != null ? String(t.female) : '', male: t?.male != null ? String(t.male) : '' }
    }
    setIndForm({ id: ind.id, indicator_code: ind.indicator_code, level: ind.level ?? '', indicator: ind.indicator, unit: ind.unit ?? '',
      baseline: ind.baseline != null ? String(ind.baseline) : '', end_target: ind.end_target != null ? String(ind.end_target) : '',
      cumulative: ind.cumulative === true ? 'Y' : ind.cumulative === false ? 'N' : '', annual })
  }

  async function saveIndicator() {
    if (!indForm) return
    const annual_targets: Record<string, object> = {}
    for (const [y, t] of Object.entries(indForm.annual)) if (t.total !== '') annual_targets[y] = t
    const ok = await send('POST', { action: 'indicator', project_id: projectId, id: indForm.id || undefined,
      indicator_code: indForm.indicator_code, level: indForm.level || null, indicator: indForm.indicator, unit: indForm.unit,
      baseline: indForm.baseline, end_target: indForm.end_target, annual_targets,
      cumulative: indForm.cumulative === 'Y' ? true : indForm.cumulative === 'N' ? false : null,
      sort_order: indForm.id ? inds.find(i => i.id === indForm.id)?.sort_order : 100 + inds.length })
    if (ok) setIndForm(null)
  }

  function openValue(indicator_id: string, period_end: string) {
    const v = vals.find(x => x.indicator_id === indicator_id && x.period_end === period_end)
    setValForm(v ? { total: v.total != null ? String(v.total) : '', female: v.female != null ? String(v.female) : '',
      male: v.male != null ? String(v.male) : '', youth: v.youth != null ? String(v.youth) : '', notes: v.notes ?? '' } : emptyVal)
    setValEdit({ indicator_id, period_end }); setMsg(null)
  }

  async function saveValue() {
    if (!valEdit) return
    if (await send('POST', { action: 'value', ...valEdit, ...valForm })) setValEdit(null)
  }

  // ── charts ────────────────────────────────────────────────────────────────
  const scored = inds.map(i => {
    const p = progress(i, valsOf(i.id))
    const tgt = i.end_target ?? null
    return { i, p, pct: p.value != null && tgt ? Math.round((p.value / tgt) * 1000) / 10 : null }
  })
  const withPct = scored.filter(s => s.pct != null)
  const selInd = inds.find(i => i.id === chartInd) ?? inds[0]
  const selVals = selInd ? valsOf(selInd.id).filter(v => v.total != null).sort((a, b) => a.period_end.localeCompare(b.period_end)) : []

  const th = { textAlign: 'right' as const }
  const small = { fontSize: '.52rem', color: '#888' }

  return (
    <div style={{ borderTop: '2px solid #FFC800', background: '#fffce8' }}>
      {/* Header */}
      <div style={{ padding: '.45rem .9rem', display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
        <span style={{ background: '#FFC800', color: '#000', fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.1rem .35rem' }}>
          Measurement framework
        </span>
        <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#333' }}>
          {sheet ? (sheet.label ?? 'Project M&E framework') : 'Project logframe indicators · 6-monthly (June / December)'}
        </span>
        {canEdit && !indForm && !sheet && (
          <button className="btn-secondary" style={{ padding: '.2rem .55rem', fontSize: '.58rem', marginLeft: 'auto' }} onClick={() => openIndicator()}>
            + Add indicator
          </button>
        )}
      </div>

      {loading ? <div style={{ padding: '0 .9rem .7rem', fontSize: '.62rem', color: '#888' }}>Loading framework…</div>
      : err ? <div style={{ padding: '0 .9rem .7rem', fontSize: '.62rem', color: '#c62828' }}>{err}</div>
      // A project with a linked Google-Sheet framework shows only that framework (as in Seedlings tab 8)
      : sheet ? <SheetFramework sheet={sheet} />
      : (<>
        {msg && <div style={{ padding: '0 .9rem .35rem', fontSize: '.58rem', color: msg.ok ? '#2e7d32' : '#c62828' }}>{msg.text}</div>}

        {/* Indicator editor */}
        {indForm && canEdit && (
          <div style={{ margin: '0 .9rem .6rem', background: '#fff', border: '1px solid #e8e0a0', padding: '.6rem .7rem', display: 'grid', gap: '.4rem' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 800 }}>{indForm.id ? 'Edit indicator' : 'New indicator'}</div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              <input placeholder="Code (e.g. SVP-01) *" value={indForm.indicator_code} onChange={e => setIndForm({ ...indForm, indicator_code: e.target.value })} style={{ width: 130, fontSize: '.6rem' }} />
              <select value={indForm.level} onChange={e => setIndForm({ ...indForm, level: e.target.value })} style={{ fontSize: '.6rem' }}>
                <option value="">Level…</option>{LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
              <input placeholder="Indicator *" value={indForm.indicator} onChange={e => setIndForm({ ...indForm, indicator: e.target.value })} style={{ flex: '1 1 260px', fontSize: '.6rem' }} />
              <input placeholder="Unit (farmers, ha…)" value={indForm.unit} onChange={e => setIndForm({ ...indForm, unit: e.target.value })} style={{ width: 120, fontSize: '.6rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="number" min={0} placeholder="Baseline" value={indForm.baseline} onChange={e => setIndForm({ ...indForm, baseline: e.target.value })} style={{ width: 100, fontSize: '.6rem' }} />
              <input type="number" min={0} placeholder="End-of-project target" value={indForm.end_target} onChange={e => setIndForm({ ...indForm, end_target: e.target.value })} style={{ width: 150, fontSize: '.6rem' }} />
              <select value={indForm.cumulative} onChange={e => setIndForm({ ...indForm, cumulative: e.target.value as '' | 'Y' | 'N' })} style={{ fontSize: '.6rem' }}>
                <option value="">Cumulative? (not set)</option>
                <option value="Y">Y — each value is a running total</option>
                <option value="N">N — each value is new in that period (summed)</option>
              </select>
            </div>
            <div style={{ fontSize: '.54rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>Yearly targets (optional)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '.35rem' }}>
              {YEARS.map(y => {
                const t = indForm.annual[y] ?? { total: '', female: '', male: '' }
                const set = (k: 'total' | 'female' | 'male', v: string) => setIndForm({ ...indForm, annual: { ...indForm.annual, [y]: { ...t, [k]: v } } })
                return (
                  <div key={y} style={{ border: '1px solid #eee', padding: '.3rem' }}>
                    <div style={small}>{y}</div>
                    <input type="number" min={0} placeholder="Total" value={t.total} onChange={e => set('total', e.target.value)} style={{ width: '100%', fontSize: '.58rem' }} />
                    <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                      <input type="number" min={0} placeholder="F" value={t.female} onChange={e => set('female', e.target.value)} style={{ width: '50%', fontSize: '.58rem' }} />
                      <input type="number" min={0} placeholder="M" value={t.male} onChange={e => set('male', e.target.value)} style={{ width: '50%', fontSize: '.58rem' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
              <button className="btn-primary" style={{ padding: '.2rem .6rem', fontSize: '.58rem' }} disabled={busy || !indForm.indicator_code || !indForm.indicator} onClick={saveIndicator}>{busy ? '…' : 'Save indicator'}</button>
              <button className="btn-secondary" style={{ padding: '.2rem .5rem', fontSize: '.58rem' }} onClick={() => setIndForm(null)}>Cancel</button>
              {indForm.id && (
                <button style={{ marginLeft: 'auto', padding: '.2rem .5rem', fontSize: '.56rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                  onClick={async () => { if (confirm('Delete this indicator and all its values?')) { if (await send('DELETE', undefined, `?indicator_id=${indForm.id}`)) setIndForm(null) } }}>
                  Delete indicator
                </button>
              )}
            </div>
          </div>
        )}

        {inds.length === 0 ? (
          <div style={{ padding: '0 .9rem .8rem', fontSize: '.62rem', color: '#888', fontStyle: 'italic' }}>
            No framework indicators for this project yet.{canEdit ? ' Use “+ Add indicator” to enter the project’s logframe.' : ''}
          </div>
        ) : (<>
          {/* Scorecard + selected year's 6-monthly values */}
          <div style={{ padding: '0 .9rem .5rem', overflowX: 'auto' }}>
            <table style={{ fontSize: '.64rem', background: '#fff', minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Indicator</th>
                  <th style={th}>{year} target</th>
                  {periods.map(p => <th key={p} style={th}>{plab(p)}</th>)}
                  <th style={th}>End target</th>
                  <th style={th}>Progress to date</th>
                  <th style={{ width: 120 }}>% of end target</th>
                  {canEdit && <th style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {scored.map(({ i, p, pct }, ri) => {
                  const yt = i.annual_targets?.[year]
                  const yv = yearValue(i, valsOf(i.id), year)
                  return (
                    <tr key={i.id} style={{ background: ri % 2 ? '#fafafa' : '#fff', verticalAlign: 'top' }}>
                      <td>
                        <span style={{ fontSize: '.5rem', fontWeight: 800, color: '#b8a800', marginRight: 4 }}>{i.indicator_code}</span>
                        <span style={{ fontWeight: 600, color: '#333' }}>{i.indicator}</span>
                        <div style={small}>
                          {[i.level, i.unit, i.cumulative === true ? 'running total' : i.cumulative === false ? 'per period (summed)' : 'cumulative not set'].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td style={th}>
                        {yt?.total != null ? <b>{fmt(yt.total)}</b> : <span style={{ color: '#ccc' }}>—</span>}
                        {yt?.total ? <div style={small}>{yv != null ? `${Math.round((yv / yt.total) * 100)}% achieved` : ''}</div> : null}
                      </td>
                      {periods.map(pe => {
                        const v = vals.find(x => x.indicator_id === i.id && x.period_end === pe)
                        const editing = valEdit?.indicator_id === i.id && valEdit.period_end === pe
                        if (editing && canEdit) return (
                          <td key={pe} style={{ minWidth: 150 }}>
                            <input type="number" min={0} placeholder="Total *" value={valForm.total} onChange={e => setValForm({ ...valForm, total: e.target.value })} style={{ width: '100%', fontSize: '.58rem' }} />
                            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                              {(['female', 'male', 'youth'] as const).map(k => (
                                <input key={k} type="number" min={0} placeholder={k[0].toUpperCase()} value={valForm[k]} onChange={e => setValForm({ ...valForm, [k]: e.target.value })} style={{ width: '33%', fontSize: '.58rem' }} />
                              ))}
                            </div>
                            <input placeholder="Notes" value={valForm.notes} onChange={e => setValForm({ ...valForm, notes: e.target.value })} style={{ width: '100%', fontSize: '.56rem', marginTop: 3 }} />
                            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                              <button className="btn-primary" style={{ padding: '.15rem .45rem', fontSize: '.54rem' }} disabled={busy || valForm.total === ''} onClick={saveValue}>{busy ? '…' : 'Save'}</button>
                              <button className="btn-secondary" style={{ padding: '.15rem .4rem', fontSize: '.54rem' }} onClick={() => setValEdit(null)}>✕</button>
                              {v && <button style={{ padding: '.15rem .35rem', fontSize: '.52rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                                onClick={async () => { if (confirm(`Delete the ${plab(pe)} value?`)) { if (await send('DELETE', undefined, `?value_id=${v.id}`)) setValEdit(null) } }}>Delete</button>}
                            </div>
                          </td>
                        )
                        return (
                          <td key={pe} style={th}>
                            {v?.total != null ? <b>{fmt(v.total)}</b> : <span style={{ color: '#ccc' }}>—</span>}
                            {v && (v.female != null || v.male != null || v.youth != null) && (
                              <div style={small}>{[v.female != null && `F ${fmt(v.female)}`, v.male != null && `M ${fmt(v.male)}`, v.youth != null && `Y ${fmt(v.youth)}`].filter(Boolean).join(' · ')}</div>
                            )}
                            {v?.total != null && pe > now && <div style={{ ...small, color: '#e65100' }}>provisional</div>}
                            {canEdit && <button className="btn-secondary" style={{ padding: '.1rem .35rem', fontSize: '.5rem', marginTop: 2 }} onClick={() => openValue(i.id, pe)}>{v ? 'Edit' : '+ Enter'}</button>}
                          </td>
                        )
                      })}
                      <td style={th}>{fmt(i.end_target)}</td>
                      <td style={th}>{p.value != null ? <><b>{fmt(p.value)}</b><div style={small}>{p.asOf}</div></> : <span style={{ color: '#ccc' }}>—</span>}</td>
                      <td>
                        {pct != null ? (<>
                          <div style={{ fontSize: '.58rem', fontWeight: 800, color: pct >= 100 ? '#2e7d32' : pct >= 50 ? '#8a6d00' : '#c62828' }}>{pct.toFixed(1)}%</div>
                          <div style={{ background: '#eee', height: 8, borderRadius: 4 }}>
                            <div style={{ width: `${Math.min(100, pct)}%`, height: 8, borderRadius: 4, background: pct >= 100 ? '#2e7d32' : pct >= 50 ? '#FFC800' : '#e65100' }} />
                          </div>
                        </>) : <span style={{ ...small, fontStyle: 'italic' }}>{i.end_target ? 'no value yet' : 'no end target'}</span>}
                      </td>
                      {canEdit && <td><button className="btn-secondary" style={{ padding: '.1rem .35rem', fontSize: '.5rem' }} onClick={() => openIndicator(i)}>Edit</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Progress charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '.6rem', padding: '0 .9rem .7rem' }}>
            <div style={{ background: '#fff', border: '1px solid #e8e0a0', padding: '.5rem .6rem' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 700, marginBottom: '.3rem' }}>Progress against end-of-project targets</div>
              {withPct.length ? (
                <div style={{ height: Math.max(140, withPct.length * 28) }}>
                  <Bar data={{ labels: withPct.map(s => s.i.indicator_code), datasets: [{ label: '% of end target', data: withPct.map(s => Math.min(150, s.pct as number)),
                      backgroundColor: withPct.map(s => (s.pct as number) >= 100 ? '#2e7d32' : (s.pct as number) >= 50 ? '#FFC800' : '#e65100'), borderRadius: 4 }] }}
                    options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false },
                      tooltip: { callbacks: { label: c => { const s = withPct[c.dataIndex]; return ` ${s.pct}% — ${fmt(s.p.value)} of ${fmt(s.i.end_target)} ${s.i.unit ?? ''}` } } } },
                      scales: { x: { min: 0, max: 150, ticks: { callback: v => `${v}%`, font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } }} />
                </div>
              ) : <div style={{ ...small, fontStyle: 'italic' }}>Add end-of-project targets and values to see progress.</div>}
              <div style={{ ...small, marginTop: 4 }}>Bars stop at 150%; the tooltip shows the true figure.</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e8e0a0', padding: '.5rem .6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.3rem' }}>
                <span style={{ fontSize: '.6rem', fontWeight: 700 }}>Values by 6-month period</span>
                <select value={selInd?.id ?? ''} onChange={e => setChartInd(e.target.value)} style={{ fontSize: '.56rem', marginLeft: 'auto', maxWidth: 220 }}>
                  {inds.map(i => <option key={i.id} value={i.id}>{i.indicator_code} — {i.indicator}</option>)}
                </select>
              </div>
              {selVals.length ? (
                <div style={{ height: 180 }}>
                  <Bar data={{ labels: selVals.map(v => plab(v.period_end)), datasets: [
                      { label: 'female', data: selVals.map(v => v.female ?? 0), backgroundColor: '#d81b60', borderRadius: 3, stack: 's' },
                      { label: 'male', data: selVals.map(v => v.male ?? 0), backgroundColor: '#1565c0', borderRadius: 3, stack: 's' },
                      { label: 'not disaggregated', data: selVals.map(v => Math.max(0, Number(v.total) - (v.female ?? 0) - (v.male ?? 0))), backgroundColor: '#bdbdbd', borderRadius: 3, stack: 's' }] }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 9 }, boxWidth: 10 } } },
                      scales: { x: { stacked: true, ticks: { font: { size: 9 } } }, y: { stacked: true, ticks: { font: { size: 9 } } } } }} />
                </div>
              ) : <div style={{ ...small, fontStyle: 'italic' }}>No values recorded for this indicator yet.</div>}
            </div>
          </div>
        </>)}
      </>)}
    </div>
  )
}
