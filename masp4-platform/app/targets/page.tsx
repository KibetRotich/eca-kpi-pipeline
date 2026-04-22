'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/lib/role-context'

const BASELINE_YEAR = 2026
const YEARS = [2026, 2027, 2028, 2029, 2030]

const ALL_COMMODITIES = ['Cocoa','Coffee','Cotton','Dairy','Fashion','F&V','Gold','Leather','Palm Oil','Tea']
const ALL_COUNTRIES   = ['Ethiopia','Kenya','Tanzania','Uganda']

const KPI_DEFS = [
  { code: 'S6.1', label: 'Farmers with enhanced resilience',            pathway: 'Production',  sampled: true  },
  { code: 'S6.2', label: 'Farmers with improved farm viability',        pathway: 'Production',  sampled: true  },
  { code: 'S2.1', label: 'Farmers accessing new/improved services',     pathway: 'Services',    sampled: true  },
  { code: 'S2.5', label: 'Individuals co-owning businesses',            pathway: 'Services',    sampled: false },
  { code: 'S6.3', label: 'Regulations / frameworks improved',           pathway: 'Governance',  sampled: false },
  { code: 'S6.4', label: 'Companies rewarding farmers directly',        pathway: 'Market',      sampled: false },
  { code: 'S6.5', label: 'Companies with responsible procurement',      pathway: 'Market',      sampled: false },
] as const

const REC_DEFS = [
  { code: 'REC01', label: 'Processors with reduced pollution'              },
  { code: 'REC02', label: 'Workers under improved working conditions'      },
  { code: 'REC03', label: 'Green jobs created'                             },
  { code: 'REC04', label: 'CSOs with enhanced capacity in policy processes' },
  { code: 'REC05', label: 'Farmers receiving premium prices'               },
] as const

const PATHWAY_COLORS: Record<string, string> = {
  Production: '#FFC800', Services: '#111', Governance: '#111', Market: '#111',
}

interface Project {
  id: string; project_code: string; project_name: string; country: string; commodity: string
}

interface TargetRow {
  id: string; kpi_code: string; target_total: number
  target_female: number | null; target_male: number | null; notes: string | null; updated_at: string
}

interface EditState {
  target_total: string; target_female: string; target_male: string; notes: string
}

const EMPTY: EditState = { target_total: '', target_female: '', target_male: '', notes: '' }

interface OutputQuarter {
  id: string; farmers_trained: number
  female_count: number | null; male_count: number | null; youth_count: number | null
  channel_notes: string | null; notes: string | null
}

interface OutputEntry { q1: OutputQuarter | null; q2: OutputQuarter | null; q3: OutputQuarter | null; q4: OutputQuarter | null; annual: number; female: number; male: number; youth: number }

interface OutputEditState {
  farmers_trained: string; female_count: string; male_count: string; youth_count: string; channel_notes: string
}

const EMPTY_OUT: OutputEditState = { farmers_trained: '', female_count: '', male_count: '', youth_count: '', channel_notes: '' }

function fmt(n: number | null | undefined) { return n != null ? n.toLocaleString() : '—' }

export default function TargetsPage() {
  const { canEdit } = useRole()
  const [year,         setYear]         = useState(String(BASELINE_YEAR))
  const [projects,     setProjects]     = useState<Project[]>([])
  const [targetMap,    setTargetMap]    = useState<Record<string, TargetRow>>({})   // "proj_code:kpi" → row
  const [achMap,       setAchMap]       = useState<Record<string, number>>({})      // "proj_code:kpi" → value
  const [loading,      setLoading]      = useState(true)
  const [editing,      setEditing]      = useState<string | null>(null)             // "proj_code:kpi"
  const [saving,       setSaving]       = useState<string | null>(null)
  const [editVals,     setEditVals]     = useState<EditState>(EMPTY)
  const [saveMsg,      setSaveMsg]      = useState<{ key: string; ok: boolean; msg: string } | null>(null)
  const [filterCountry,    setFilterCountry]    = useState('')
  const [filterCommodity,  setFilterCommodity]  = useState('')
  const [filterProject,    setFilterProject]    = useState('')

  // Output KPI state
  const [outputMap,    setOutputMap]    = useState<Record<string, OutputEntry>>({})  // project_code → quarters
  const [outEditing,   setOutEditing]   = useState<string | null>(null)              // "proj_code:q1"
  const [outSaving,    setOutSaving]    = useState<string | null>(null)
  const [outEditVals,  setOutEditVals]  = useState<OutputEditState>(EMPTY_OUT)
  const [outSaveMsg,   setOutSaveMsg]   = useState<{ key: string; ok: boolean; msg: string } | null>(null)

  // REC KPI state (manually entered annual counts)
  const [recMap,    setRecMap]    = useState<Record<string, number>>({})   // "proj_code:REC01" → count
  const [recIdMap,  setRecIdMap]  = useState<Record<string, string>>({})   // same key → row id
  const [recEditing, setRecEditing] = useState<string | null>(null)        // "proj_code:REC01"
  const [recSaving,  setRecSaving]  = useState<string | null>(null)
  const [recEditVal, setRecEditVal] = useState('')
  const [recNotesVal,setRecNotesVal]= useState('')
  const [recSaveMsg, setRecSaveMsg] = useState<{ key: string; ok: boolean; msg: string } | null>(null)

  const load = useCallback(async (yr: string) => {
    setLoading(true)
    const [pRes, tRes, oRes, rRes] = await Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/targets?year=${yr}`).then(r => r.json()),
      fetch(`/api/outputs?year=${yr}`).then(r => r.json()),
      fetch(`/api/rec?year=${yr}`).then(r => r.json()),
    ])
    setProjects(Array.isArray(pRes) ? pRes : [])
    if (tRes && !tRes.error) {
      setTargetMap(tRes.targetMap ?? {})
      setAchMap(tRes.achMap ?? {})
    }
    if (oRes && !oRes.error) {
      setOutputMap(oRes.outputMap ?? {})
    }
    if (rRes && !rRes.error) {
      setRecMap(rRes.recMap ?? {})
      setRecIdMap(rRes.recIdMap ?? {})
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(year) }, [year, load])

  function cellKey(code: string, kpi: string) { return `${code}:${kpi}` }

  function startEdit(code: string, kpi: string) {
    const existing = targetMap[cellKey(code, kpi)]
    setEditVals(existing ? {
      target_total:  String(existing.target_total),
      target_female: existing.target_female != null ? String(existing.target_female) : '',
      target_male:   existing.target_male   != null ? String(existing.target_male)   : '',
      notes:         existing.notes ?? '',
    } : EMPTY)
    setEditing(cellKey(code, kpi))
    setSaveMsg(null)
  }

  async function save(projectId: string, code: string, kpi: string) {
    const key = cellKey(code, kpi)
    setSaving(key)
    try {
      const res = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:    projectId,
          survey_year:   Number(year),
          kpi_code:      kpi,
          target_total:  Number(editVals.target_total),
          target_female: editVals.target_female !== '' ? Number(editVals.target_female) : null,
          target_male:   editVals.target_male   !== '' ? Number(editVals.target_male)   : null,
          notes:         editVals.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) setSaveMsg({ key, ok: false, msg: json.error ?? 'Save failed' })
      else { setSaveMsg({ key, ok: true, msg: 'Saved' }); setEditing(null); await load(year) }
    } catch { setSaveMsg({ key, ok: false, msg: 'Network error' }) }
    finally { setSaving(null) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this target?')) return
    await fetch(`/api/targets?id=${id}`, { method: 'DELETE' })
    await load(year)
  }

  function startOutEdit(code: string, q: number) {
    const key = `${code}:q${q}`
    const entry = outputMap[code]
    const existing = entry?.[`q${q}` as keyof OutputEntry] as OutputQuarter | null
    setOutEditVals(existing ? {
      farmers_trained: String(existing.farmers_trained),
      female_count:    existing.female_count  != null ? String(existing.female_count)  : '',
      male_count:      existing.male_count    != null ? String(existing.male_count)    : '',
      youth_count:     existing.youth_count   != null ? String(existing.youth_count)   : '',
      channel_notes:   existing.channel_notes ?? '',
    } : EMPTY_OUT)
    setOutEditing(key)
    setOutSaveMsg(null)
  }

  async function saveOut(projectId: string, code: string, q: number) {
    const key = `${code}:q${q}`
    setOutSaving(key)
    try {
      const res = await fetch('/api/outputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:      projectId,
          survey_year:     Number(year),
          quarter:         q,
          farmers_trained: Number(outEditVals.farmers_trained) || 0,
          female_count:    outEditVals.female_count   !== '' ? Number(outEditVals.female_count)   : null,
          male_count:      outEditVals.male_count     !== '' ? Number(outEditVals.male_count)     : null,
          youth_count:     outEditVals.youth_count    !== '' ? Number(outEditVals.youth_count)    : null,
          channel_notes:   outEditVals.channel_notes  || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) setOutSaveMsg({ key, ok: false, msg: json.error ?? 'Save failed' })
      else { setOutSaveMsg({ key, ok: true, msg: 'Saved' }); setOutEditing(null); await load(year) }
    } catch { setOutSaveMsg({ key, ok: false, msg: 'Network error' }) }
    finally { setOutSaving(null) }
  }

  async function removeOut(id: string) {
    if (!confirm('Delete this quarterly output record?')) return
    await fetch(`/api/outputs?id=${id}`, { method: 'DELETE' })
    await load(year)
  }

  async function saveRec(projectId: string, code: string, recCode: string) {
    const key = cellKey(code, recCode)
    setRecSaving(key)
    try {
      const res = await fetch('/api/rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:  projectId,
          survey_year: Number(year),
          rec_code:    recCode,
          count:       Number(recEditVal) || 0,
          notes:       recNotesVal || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) setRecSaveMsg({ key, ok: false, msg: json.error ?? 'Save failed' })
      else { setRecSaveMsg({ key, ok: true, msg: 'Saved' }); setRecEditing(null); await load(year) }
    } catch { setRecSaveMsg({ key, ok: false, msg: 'Network error' }) }
    finally { setRecSaving(null) }
  }

  async function removeRec(id: string) {
    if (!confirm('Delete this REC count?')) return
    await fetch(`/api/rec?id=${id}`, { method: 'DELETE' })
    await load(year)
  }

  const countries   = ALL_COUNTRIES
  const commodities = ALL_COMMODITIES
  const visible     = projects.filter(p =>
    (!filterCountry   || p.country      === filterCountry) &&
    (!filterCommodity || p.commodity    === filterCommodity) &&
    (!filterProject   || p.project_code === filterProject)
  )


  return (
    <div>

      {/* Header */}
      <div style={{ marginBottom: '.9rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111' }}>Targets &amp; Achievements</div>
        <div style={{ fontSize: '.58rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 2 }}>
          Per-KPI annual targets from logframe · Achievement extrapolated from sample surveys
        </div>
      </div>

      {/* Year + filters bar */}
      <div style={{
        background: '#fff', border: '1px solid #d0d0d0',
        padding: '.45rem .75rem', marginBottom: '.9rem',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.45rem 1rem',
      }}>
        <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#666' }}>Year</span>
        <div style={{ position: 'relative' }}>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ paddingRight: '1.4rem', minWidth: 130 }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
        </div>

        {[
          { label: 'Country',   value: filterCountry,   opts: countries,   set: setFilterCountry,   ph: 'All countries'   },
          { label: 'Commodity', value: filterCommodity, opts: commodities, set: setFilterCommodity, ph: 'All commodities' },
        ].map(({ label, value, opts, set, ph }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
            <div style={{ position: 'relative' }}>
              <select value={value} onChange={e => set(e.target.value)} style={{ paddingRight: '1.4rem', minWidth: 130 }}>
                <option value="">{ph}</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
            </div>
          </div>
        ))}

        {/* Project filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
          <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>Project</span>
          <div style={{ position: 'relative' }}>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ paddingRight: '1.4rem', minWidth: 190 }}>
              <option value="">All projects</option>
              {projects
                .filter(p =>
                  (!filterCountry   || p.country   === filterCountry) &&
                  (!filterCommodity || p.commodity === filterCommodity)
                )
                .sort((a, b) => a.project_name.localeCompare(b.project_name))
                .map(p => (
                  <option key={p.project_code} value={p.project_code}>
                    {p.project_code} — {p.project_name}
                  </option>
                ))}
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
          </div>
        </div>

        {(filterCountry || filterCommodity || filterProject) && (
          <button className="btn-secondary" onClick={() => { setFilterCountry(''); setFilterCommodity(''); setFilterProject('') }} style={{ marginLeft: 'auto' }}>Clear</button>
        )}

      </div>

      {loading ? (
        <div style={{ fontSize: '.7rem', color: '#888', padding: '1.5rem 0' }}>Loading…</div>
      ) : (
        visible.map(project => (
          <div key={project.id} className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>

            {/* Project header */}
            <div style={{ background: '#111', color: '#fff', padding: '.5rem .9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#FFC800', marginRight: '.5rem' }}>
                  {project.project_code}
                </span>
                <span style={{ fontSize: '.68rem', fontWeight: 700 }}>{project.project_name}</span>
              </div>
              <div style={{ fontSize: '.56rem', color: '#aaa', letterSpacing: '.5px' }}>
                {project.country} · {project.commodity}
              </div>
            </div>

            {/* KPI rows */}
            <table style={{ fontSize: '.68rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: 52 }}>KPI</th>
                  <th style={{ textAlign: 'left' }}>Indicator</th>
                  <th style={{ textAlign: 'right' }}>Annual target</th>
                  <th style={{ textAlign: 'right' }}>Female</th>
                  <th style={{ textAlign: 'right' }}>Male</th>
                  <th style={{ textAlign: 'right' }}>Achievement</th>
                  {canEdit && <th style={{ width: 80 }}></th>}
                </tr>
              </thead>
              <tbody>
                {KPI_DEFS.map((kpi, ki) => {
                  const key     = cellKey(project.project_code, kpi.code)
                  const tgt     = targetMap[key]
                  const ach     = achMap[key] ?? 0
                  const isEdit  = editing === key
                  const isSave  = saving  === key
                  const msg     = saveMsg?.key === key ? saveMsg : null
                  const color   = PATHWAY_COLORS[kpi.pathway]
                  const rowBg   = ki % 2 === 0 ? '#fff' : '#fafafa'

                  return (
                    <tr key={kpi.code} style={{ background: rowBg }}>

                      {/* KPI badge */}
                      <td>
                        <span style={{
                          display: 'inline-block',
                          background: color, color: color === '#FFC800' ? '#000' : '#fff',
                          fontSize: '.48rem', fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '.5px',
                          padding: '.1rem .35rem',
                        }}>
                          {kpi.code}
                        </span>
                      </td>

                      {/* Indicator label */}
                      <td style={{ color: '#444', fontWeight: 600 }}>{kpi.label}</td>

                      {isEdit && canEdit ? (
                        <>
                          <td>
                            <input type="number" min={1} placeholder="Required"
                              value={editVals.target_total}
                              onChange={e => setEditVals(v => ({ ...v, target_total: e.target.value }))}
                              style={{ width: 90, textAlign: 'right' }} />
                          </td>
                          <td>
                            <input type="number" min={0} placeholder="—"
                              value={editVals.target_female}
                              onChange={e => setEditVals(v => ({ ...v, target_female: e.target.value }))}
                              style={{ width: 70, textAlign: 'right' }} />
                          </td>
                          <td>
                            <input type="number" min={0} placeholder="—"
                              value={editVals.target_male}
                              onChange={e => setEditVals(v => ({ ...v, target_male: e.target.value }))}
                              style={{ width: 70, textAlign: 'right' }} />
                          </td>
                          {/* Achievement — calculated, always read-only */}
                          <td style={{ textAlign: 'right', color: '#aaa', fontStyle: 'italic', fontSize: '.6rem' }}>calculated</td>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 4 }}>
                            <button className="btn-primary"
                              style={{ padding: '.2rem .55rem', fontSize: '.6rem' }}
                              disabled={isSave || !editVals.target_total}
                              onClick={() => save(project.id, project.project_code, kpi.code)}>
                              {isSave ? '…' : 'Save'}
                            </button>
                            <button className="btn-secondary"
                              style={{ padding: '.2rem .45rem', fontSize: '.6rem' }}
                              onClick={() => { setEditing(null); setSaveMsg(null) }}>
                              ✕
                            </button>
                            {msg && <span style={{ fontSize: '.56rem', color: msg.ok ? '#2e7d32' : '#c62828' }}>{msg.msg}</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Target */}
                          <td style={{ textAlign: 'right', fontWeight: tgt ? 700 : 400, fontVariantNumeric: 'tabular-nums', color: tgt ? '#111' : '#ccc' }}>
                            {tgt ? tgt.target_total.toLocaleString() : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: tgt?.target_female != null ? '#1a3557' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(tgt?.target_female)}
                          </td>
                          <td style={{ textAlign: 'right', color: tgt?.target_male != null ? '#555' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(tgt?.target_male)}
                          </td>

                          {/* Achievement */}
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {ach > 0 ? (
                              <>
                                <span style={{ fontWeight: 800, color: '#111' }}>{ach.toLocaleString()}</span>
                                <span style={{
                                  marginLeft: '.3rem',
                                  background: tgt ? '#FFC800' : '#e0e0e0',
                                  color: tgt ? '#000' : '#666',
                                  fontSize: '.44rem', fontWeight: 800,
                                  textTransform: 'uppercase', letterSpacing: '.4px',
                                  padding: '.05rem .25rem',
                                }}>
                                  {tgt ? (kpi.sampled ? 'est.' : 'count') : 'sample'}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: '#ccc' }}>—</span>
                            )}
                          </td>

                          {/* Actions — M&E Officer / Admin only */}
                          {canEdit && (
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button className="btn-secondary"
                                style={{ padding: '.2rem .5rem', fontSize: '.6rem', marginRight: tgt ? 4 : 0 }}
                                onClick={() => startEdit(project.project_code, kpi.code)}>
                                {tgt ? 'Edit' : '+ Add'}
                              </button>
                              {tgt && (
                                <button
                                  style={{ padding: '.2rem .4rem', fontSize: '.6rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                                  onClick={() => remove(tgt.id)}>
                                  ✕
                                </button>
                              )}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* ── Output KPI: Farmers Trained / Reached (quarterly) ── */}
            {(() => {
              const out    = outputMap[project.project_code] ?? { q1: null, q2: null, q3: null, q4: null, annual: 0, female: 0, male: 0, youth: 0 }
              const outTgt = targetMap[cellKey(project.project_code, 'OUT.1')]
              const tgtKey = cellKey(project.project_code, 'OUT.1')
              const isTgtEdit = editing === tgtKey
              const isTgtSave = saving  === tgtKey
              const tgtMsg    = saveMsg?.key === tgtKey ? saveMsg : null
              return (
                <div style={{ borderTop: '2px solid #FFC800', background: '#fffce8' }}>
                  {/* Section header — label + annual target + achievement */}
                  <div style={{ padding: '.4rem .9rem', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flex: '0 0 auto' }}>
                      <span style={{ background: '#FFC800', color: '#000', fontSize: '.48rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.1rem .35rem' }}>
                        OUTPUT
                      </span>
                      <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#333' }}>Farmers Trained / Reached</span>
                      <span style={{ fontSize: '.54rem', color: '#888' }}>training events · TV/radio · demo farms · digital</span>
                    </div>

                    {/* Annual target */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginLeft: 'auto' }}>
                      <span style={{ fontSize: '.54rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#888' }}>Annual target</span>
                      {isTgtEdit && canEdit ? (
                        <>
                          <input type="number" min={1} placeholder="Required"
                            value={editVals.target_total}
                            onChange={e => setEditVals(v => ({ ...v, target_total: e.target.value }))}
                            style={{ width: 100, fontSize: '.6rem', textAlign: 'right' }} />
                          <input type="number" min={0} placeholder="Female"
                            value={editVals.target_female}
                            onChange={e => setEditVals(v => ({ ...v, target_female: e.target.value }))}
                            style={{ width: 72, fontSize: '.6rem', textAlign: 'right' }} />
                          <button className="btn-primary"
                            style={{ padding: '.2rem .55rem', fontSize: '.58rem' }}
                            disabled={isTgtSave || !editVals.target_total}
                            onClick={() => save(project.id, project.project_code, 'OUT.1')}>
                            {isTgtSave ? '…' : 'Save'}
                          </button>
                          <button className="btn-secondary"
                            style={{ padding: '.2rem .45rem', fontSize: '.58rem' }}
                            onClick={() => { setEditing(null); setSaveMsg(null) }}>✕</button>
                          {tgtMsg && <span style={{ fontSize: '.54rem', color: tgtMsg.ok ? '#2e7d32' : '#c62828' }}>{tgtMsg.msg}</span>}
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '.8rem', fontWeight: 800, color: outTgt ? '#111' : '#ccc' }}>
                            {outTgt ? outTgt.target_total.toLocaleString() : '—'}
                          </span>
                          {outTgt?.target_female != null && (
                            <span style={{ fontSize: '.58rem', color: '#1a3557' }}>F: {outTgt.target_female.toLocaleString()}</span>
                          )}
                          {canEdit && (
                            <>
                              <button className="btn-secondary"
                                style={{ padding: '.15rem .45rem', fontSize: '.56rem' }}
                                onClick={() => startEdit(project.project_code, 'OUT.1')}>
                                {outTgt ? 'Edit' : '+ Add target'}
                              </button>
                              {outTgt && (
                                <button style={{ padding: '.15rem .35rem', fontSize: '.56rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                                  onClick={() => remove(outTgt.id)}>✕</button>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Annual achievement (sum of quarters) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', borderLeft: '1px solid #e8e0a0', paddingLeft: '.75rem' }}>
                      <span style={{ fontSize: '.54rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#888' }}>Achievement</span>
                      <span style={{ fontSize: '.8rem', fontWeight: 800, color: out.annual > 0 ? '#111' : '#ccc' }}>
                        {out.annual > 0 ? out.annual.toLocaleString() : '—'}
                      </span>
                      {out.annual > 0 && outTgt && (
                        <span style={{ background: '#FFC800', color: '#000', fontSize: '.44rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', padding: '.05rem .3rem' }}>
                          {Math.round(out.annual / outTgt.target_total * 100)}%
                        </span>
                      )}
                      {out.female > 0 && <span style={{ fontSize: '.56rem', color: '#1a3557' }}>F: {out.female.toLocaleString()}</span>}
                      {out.youth  > 0 && <span style={{ fontSize: '.56rem', color: '#e65100' }}>Y: {out.youth.toLocaleString()}</span>}
                    </div>
                  </div>

                  {/* Q1–Q4 row */}
                  <div style={{ padding: '0 .9rem .2rem', fontSize: '.52rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#b8a800' }}>
                    Quarterly breakdown — {year}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, padding: '0 .9rem .55rem' }}>
                    {([1, 2, 3, 4] as const).map(q => {
                      const qKey   = `${project.project_code}:q${q}`
                      const qData  = out[`q${q}` as keyof typeof out] as OutputQuarter | null
                      const isQEdit = outEditing === qKey
                      const isQSave = outSaving  === qKey
                      const qMsg   = outSaveMsg?.key === qKey ? outSaveMsg : null

                      return (
                        <div key={q} style={{ background: '#fff', border: '1px solid #e8e0a0', padding: '.45rem .6rem' }}>
                          <div style={{ fontSize: '.54rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: '#888', marginBottom: '.3rem' }}>Q{q} · {year}</div>

                          {isQEdit ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                              <input type="number" min={0} placeholder="Farmers trained *"
                                value={outEditVals.farmers_trained}
                                onChange={e => setOutEditVals(v => ({ ...v, farmers_trained: e.target.value }))}
                                style={{ width: '100%', fontSize: '.6rem' }} />
                              <div style={{ display: 'flex', gap: '.3rem' }}>
                                <input type="number" min={0} placeholder="Female"
                                  value={outEditVals.female_count}
                                  onChange={e => setOutEditVals(v => ({ ...v, female_count: e.target.value }))}
                                  style={{ width: '50%', fontSize: '.6rem' }} />
                                <input type="number" min={0} placeholder="Youth"
                                  value={outEditVals.youth_count}
                                  onChange={e => setOutEditVals(v => ({ ...v, youth_count: e.target.value }))}
                                  style={{ width: '50%', fontSize: '.6rem' }} />
                              </div>
                              <input type="text" placeholder="Channel notes (optional)"
                                value={outEditVals.channel_notes}
                                onChange={e => setOutEditVals(v => ({ ...v, channel_notes: e.target.value }))}
                                style={{ width: '100%', fontSize: '.6rem' }} />
                              <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                                <button className="btn-primary"
                                  style={{ padding: '.2rem .5rem', fontSize: '.56rem' }}
                                  disabled={isQSave || !outEditVals.farmers_trained}
                                  onClick={() => saveOut(project.id, project.project_code, q)}>
                                  {isQSave ? '…' : 'Save'}
                                </button>
                                <button className="btn-secondary"
                                  style={{ padding: '.2rem .4rem', fontSize: '.56rem' }}
                                  onClick={() => { setOutEditing(null); setOutSaveMsg(null) }}>
                                  ✕
                                </button>
                                {qMsg && <span style={{ fontSize: '.52rem', color: qMsg.ok ? '#2e7d32' : '#c62828' }}>{qMsg.msg}</span>}
                              </div>
                            </div>
                          ) : (
                            <div>
                              {qData ? (
                                <>
                                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111', lineHeight: 1.1 }}>
                                    {qData.farmers_trained.toLocaleString()}
                                  </div>
                                  <div style={{ fontSize: '.52rem', color: '#888', marginTop: 2 }}>
                                    {qData.female_count != null && <span>F:{qData.female_count.toLocaleString()} </span>}
                                    {qData.youth_count  != null && <span>Y:{qData.youth_count.toLocaleString()}</span>}
                                  </div>
                                  {qData.channel_notes && (
                                    <div style={{ fontSize: '.48rem', color: '#aaa', marginTop: 2, fontStyle: 'italic' }}>{qData.channel_notes}</div>
                                  )}
                                  {canEdit && (
                                    <div style={{ display: 'flex', gap: 4, marginTop: '.35rem' }}>
                                      <button className="btn-secondary"
                                        style={{ padding: '.15rem .4rem', fontSize: '.52rem' }}
                                        onClick={() => startOutEdit(project.project_code, q)}>Edit</button>
                                      <button
                                        style={{ padding: '.15rem .35rem', fontSize: '.52rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                                        onClick={() => removeOut(qData.id)}>✕</button>
                                    </div>
                                  )}
                                </>
                              ) : canEdit ? (
                                <button className="btn-secondary"
                                  style={{ padding: '.2rem .5rem', fontSize: '.56rem', marginTop: '.25rem' }}
                                  onClick={() => startOutEdit(project.project_code, q)}>
                                  + Enter
                                </button>
                              ) : (
                                <div style={{ fontSize: '.52rem', color: '#ccc', fontStyle: 'italic', marginTop: '.3rem' }}>—</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* ── REC Level Indicators ── */}
            <div style={{ borderTop: '2px solid #111' }}>
              <div style={{ background: '#111', color: '#FFC800', padding: '.4rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                REC Level Indicators — Direct Count · Annual
              </div>
              <table style={{ fontSize: '.65rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', width: 60 }}>Code</th>
                    <th style={{ textAlign: 'left' }}>Indicator</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Annual target</th>
                    <th style={{ textAlign: 'right', width: 130 }}>Annual count</th>
                    {canEdit && <th style={{ width: 200 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {REC_DEFS.map((rec, ri) => {
                    const tgtKey    = cellKey(project.project_code, rec.code)
                    const tgt       = targetMap[tgtKey]
                    const count     = recMap[tgtKey] ?? 0
                    const recId     = recIdMap[tgtKey]
                    const isTgtEdit = editing    === tgtKey
                    const isRecEdit = recEditing === tgtKey
                    const isTgtSave = saving     === tgtKey
                    const isRecSave = recSaving  === tgtKey
                    const tgtMsg    = saveMsg?.key  === tgtKey ? saveMsg  : null
                    const recMsg    = recSaveMsg?.key === tgtKey ? recSaveMsg : null
                    const rowBg     = ri % 2 === 0 ? '#fff' : '#fafafa'

                    return (
                      <tr key={rec.code} style={{ background: rowBg }}>
                        <td>
                          <span style={{ display: 'inline-block', background: '#111', color: '#FFC800', fontSize: '.46rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', padding: '.1rem .35rem' }}>
                            {rec.code}
                          </span>
                        </td>
                        <td style={{ color: '#444', fontWeight: 600 }}>{rec.label}</td>

                        {/* Annual target */}
                        <td style={{ textAlign: 'right' }}>
                          {isTgtEdit && canEdit ? (
                            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <input type="number" min={1} placeholder="Target"
                                value={editVals.target_total}
                                onChange={e => setEditVals(v => ({ ...v, target_total: e.target.value }))}
                                style={{ width: 75, textAlign: 'right', fontSize: '.6rem' }} />
                              <button className="btn-primary" style={{ padding: '.2rem .5rem', fontSize: '.56rem' }}
                                disabled={isTgtSave || !editVals.target_total}
                                onClick={() => save(project.id, project.project_code, rec.code)}>
                                {isTgtSave ? '…' : 'Save'}
                              </button>
                              <button className="btn-secondary" style={{ padding: '.2rem .4rem', fontSize: '.56rem' }}
                                onClick={() => { setEditing(null); setSaveMsg(null) }}>✕</button>
                              {tgtMsg && <span style={{ fontSize: '.52rem', color: tgtMsg.ok ? '#2e7d32' : '#c62828' }}>{tgtMsg.msg}</span>}
                            </div>
                          ) : (
                            <span style={{ fontWeight: tgt ? 700 : 400, color: tgt ? '#111' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                              {tgt ? tgt.target_total.toLocaleString() : '—'}
                            </span>
                          )}
                        </td>

                        {/* Annual count (manually entered) */}
                        <td style={{ textAlign: 'right' }}>
                          {isRecEdit && canEdit ? (
                            <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <input type="number" min={0} placeholder="Count"
                                value={recEditVal}
                                onChange={e => setRecEditVal(e.target.value)}
                                style={{ width: 75, textAlign: 'right', fontSize: '.6rem' }} />
                              <button className="btn-primary" style={{ padding: '.2rem .5rem', fontSize: '.56rem' }}
                                disabled={isRecSave}
                                onClick={() => saveRec(project.id, project.project_code, rec.code)}>
                                {isRecSave ? '…' : 'Save'}
                              </button>
                              <button className="btn-secondary" style={{ padding: '.2rem .4rem', fontSize: '.56rem' }}
                                onClick={() => { setRecEditing(null); setRecSaveMsg(null) }}>✕</button>
                              {recMsg && <span style={{ fontSize: '.52rem', color: recMsg.ok ? '#2e7d32' : '#c62828' }}>{recMsg.msg}</span>}
                            </div>
                          ) : (
                            <>
                              <span style={{ fontWeight: count > 0 ? 800 : 400, color: count > 0 ? '#111' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                                {count > 0 ? count.toLocaleString() : '—'}
                              </span>
                              {count > 0 && tgt && (
                                <span style={{ marginLeft: '.3rem', background: '#FFC800', color: '#000', fontSize: '.44rem', fontWeight: 800, textTransform: 'uppercase', padding: '.05rem .25rem' }}>
                                  {Math.round(count / tgt.target_total * 100)}%
                                </span>
                              )}
                            </>
                          )}
                        </td>

                        {/* Actions */}
                        {canEdit && !isTgtEdit && !isRecEdit && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn-secondary"
                              style={{ padding: '.2rem .45rem', fontSize: '.54rem', marginRight: 2 }}
                              onClick={() => startEdit(project.project_code, rec.code)}>
                              {tgt ? 'Edit target' : '+ Target'}
                            </button>
                            {tgt && (
                              <button style={{ padding: '.2rem .35rem', fontSize: '.54rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer', marginRight: 4 }}
                                onClick={() => remove(tgt.id)}>✕</button>
                            )}
                            <button className="btn-secondary"
                              style={{ padding: '.2rem .45rem', fontSize: '.54rem' }}
                              onClick={() => { setRecEditVal(count > 0 ? String(count) : ''); setRecNotesVal(''); setRecEditing(tgtKey); setRecSaveMsg(null) }}>
                              {recId ? 'Edit count' : '+ Count'}
                            </button>
                            {recId && (
                              <button style={{ padding: '.2rem .35rem', fontSize: '.54rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer', marginLeft: 2 }}
                                onClick={() => removeRec(recId)}>✕</button>
                            )}
                          </td>
                        )}
                        {canEdit && (isTgtEdit || isRecEdit) && <td />}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

          </div>
        ))
      )}

      {!loading && visible.length === 0 && (
        <div style={{ fontSize: '.7rem', color: '#aaa', fontStyle: 'italic', padding: '1rem 0' }}>
          No projects match the selected filters.
        </div>
      )}
    </div>
  )
}
