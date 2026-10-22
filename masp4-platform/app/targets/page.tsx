'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/lib/role-context'
import ProjectFramework from './ProjectFramework'

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

const PATHWAY_COLORS: Record<string, string> = {
  Production: '#FFC800', Services: '#111', Governance: '#111', Market: '#111',
}

interface Project {
  id: string; project_code: string; project_name: string; country: string; commodity: string
  has_framework?: boolean
}

interface TargetRow {
  id: string; kpi_code: string; target_total: number
  target_female: number | null; target_male: number | null; notes: string | null; updated_at: string
}

interface EditState {
  target_total: string; target_female: string; target_male: string; notes: string
}

const EMPTY: EditState = { target_total: '', target_female: '', target_male: '', notes: '' }

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
  const [search,           setSearch]           = useState('')
  const gridScroll = useRef(0)                                     // scroll position of the project grid
  const openedAtLength = useRef<number | null>(null)               // history.length right after a project was opened

  const load = useCallback(async (yr: string) => {
    setLoading(true)
    const [pRes, tRes] = await Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch(`/api/targets?year=${yr}`).then(r => r.json()),
    ])
    setProjects(Array.isArray(pRes) ? pRes : [])
    if (tRes && !tRes.error) {
      setTargetMap(tRes.targetMap ?? {})
      setAchMap(tRes.achMap ?? {})
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(year) }, [year, load])

  // Project view <-> URL (?project=CODE). Opening a project pushes a history entry,
  // so both the "Back to projects" button and the browser Back button return to the grid
  // (see backToProjects for the embedded-sheet case).
  useEffect(() => {
    const fromUrl = () => setFilterProject(new URLSearchParams(window.location.search).get('project') ?? '')
    fromUrl()
    window.addEventListener('popstate', fromUrl)
    return () => window.removeEventListener('popstate', fromUrl)
  }, [])
  useEffect(() => {
    if (!filterProject) window.scrollTo(0, gridScroll.current)   // back on the grid: restore position
  }, [filterProject])

  function openProject(code: string) {
    if (!filterProject) gridScroll.current = window.scrollY
    window.history.pushState({ project: code }, '', `?project=${encodeURIComponent(code)}`)
    openedAtLength.current = window.history.length
    setFilterProject(code)
    window.scrollTo(0, 0)
  }

  // history.back() is only safe when nothing has been added to the history since the project opened.
  // The embedded Google Sheet (SheetFramework iframe) adds its own entries when a signed-in user clicks
  // inside it, and back() would then rewind the sheet instead of this page — so fall back to going to the
  // grid directly.
  function backToProjects() {
    const nothingAdded = openedAtLength.current === window.history.length
    if (window.history.state?.project && nothingAdded) window.history.back()   // popstate restores the grid
    else { window.history.replaceState(null, '', window.location.pathname); setFilterProject('') }
    openedAtLength.current = null
  }

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

  const countries   = ALL_COUNTRIES
  const commodities = ALL_COMMODITIES
  const visible     = projects.filter(p =>
    (!filterCountry   || p.country      === filterCountry) &&
    (!filterCommodity || p.commodity    === filterCommodity) &&
    (!filterProject   || p.project_code === filterProject)
  )
  const q = search.trim().toLowerCase()
  const gridProjects = projects
    .filter(p =>
      (!filterCountry   || p.country   === filterCountry) &&
      (!filterCommodity || p.commodity === filterCommodity) &&
      (!q || p.project_name.toLowerCase().includes(q) || p.project_code.toLowerCase().includes(q)))
    .sort((a, b) => a.country.localeCompare(b.country) || a.project_name.localeCompare(b.project_name))
  // projects with a measurement framework first, then those not yet updated
  const gridGroups = [
    { label: 'With measurement framework', items: gridProjects.filter(p => p.has_framework) },
    { label: 'Measurement framework not yet added', items: gridProjects.filter(p => !p.has_framework) },
  ].filter(g => g.items.length)


  return (
    <div>

      {/* Header */}
      <div style={{ marginBottom: '.9rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111' }}>Projects&rsquo; Progress</div>
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
            <select value={filterProject} onChange={e => e.target.value ? openProject(e.target.value) : backToProjects()} style={{ paddingRight: '1.4rem', minWidth: 190 }}>
              <option value="">All projects</option>
              {projects
                .filter(p =>
                  (!filterCountry   || p.country   === filterCountry) &&
                  (!filterCommodity || p.commodity === filterCommodity)
                )
                .sort((a, b) => Number(!!b.has_framework) - Number(!!a.has_framework) || a.project_name.localeCompare(b.project_name))
                .map(p => (
                  <option key={p.project_code} value={p.project_code}>
                    {p.project_code} — {p.project_name}
                  </option>
                ))}
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
          </div>
        </div>

        {/* Quick search — only on the project grid */}
        {!filterProject && (
          <input type="search" placeholder="Search project name or code…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ minWidth: 220, fontSize: '.65rem' }} />
        )}

        {(filterCountry || filterCommodity || filterProject || search) && (
          <button className="btn-secondary" onClick={() => { setFilterCountry(''); setFilterCommodity(''); setSearch(''); if (filterProject) backToProjects() }} style={{ marginLeft: 'auto' }}>Clear</button>
        )}

      </div>

      {loading ? (
        <div style={{ fontSize: '.7rem', color: '#888', padding: '1.5rem 0' }}>Loading…</div>
      ) : !filterProject ? (
        <>
          <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: '.5rem' }}>
            Projects · {gridProjects.length} — select a project to view and edit its targets
          </div>
          {gridGroups.map(grp => (<div key={grp.label} style={{ marginBottom: '.9rem' }}>
          <div style={{ fontSize: '.54rem', fontWeight: 700, color: '#888', margin: '.2rem 0 .4rem' }}>{grp.label} · {grp.items.length}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.6rem' }}>
            {grp.items.map(p => {
              const set = Object.keys(targetMap).filter(k => k.startsWith(p.project_code + ':')).length
              return (
                <button key={p.id} type="button" onClick={() => openProject(p.project_code)}
                  className="cc"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '.65rem .8rem', margin: 0, border: '1px solid #d0d0d0',
                           borderTop: '3px solid #FFC800', background: '#fff', display: 'flex', flexDirection: 'column', gap: '.25rem', minHeight: 96 }}>
                  <span style={{ fontSize: '.56rem', fontWeight: 800, letterSpacing: '1px', color: '#b8a800', textTransform: 'uppercase' }}>{p.project_code}</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#111', lineHeight: 1.25 }}>{p.project_name}</span>
                  <span style={{ fontSize: '.56rem', color: '#888', marginTop: 'auto' }}>{p.country} · {p.commodity}</span>
                  <span style={{ fontSize: '.52rem', color: set ? '#2e7d32' : '#aaa' }}>
                    {set ? `${set} target${set === 1 ? '' : 's'} set for ${year}` : `No targets set for ${year}`}
                  </span>
                  {p.has_framework && <span style={{ fontSize: '.52rem', color: '#2e7d32', fontWeight: 700 }}>✓ Measurement framework</span>}
                </button>
              )
            })}
          </div>
          </div>))}
        </>
      ) : (
        <>
        <button type="button" className="btn-secondary" onClick={backToProjects} style={{ marginBottom: '.7rem' }}>
          ← Back to projects
        </button>
        {visible.map(project => (
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

            {/* ── Measurement framework (replaces the quarterly OUTPUT and REC sections — Sprint 28) ── */}
            <ProjectFramework projectId={project.id} year={year} canEdit={canEdit} />

          </div>
        ))}
        </>
      )}

      {!loading && (filterProject ? visible.length === 0 : gridProjects.length === 0) && (
        <div style={{ fontSize: '.7rem', color: '#aaa', fontStyle: 'italic', padding: '1rem 0' }}>
          No projects match the selected filters.
        </div>
      )}
    </div>
  )
}
