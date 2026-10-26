'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/lib/role-context'
import ProjectFramework from './ProjectFramework'

const BASELINE_YEAR = 2026
const YEARS = [2026, 2027, 2028, 2029, 2030]

const ALL_COMMODITIES = ['Cocoa','Coffee','Cotton','Dairy','Fashion','F&V','Gold','Leather','Palm Oil','Tea']
const ALL_COUNTRIES   = ['Ethiopia','Kenya','Tanzania','Uganda']

interface Project {
  id: string; project_code: string; project_name: string; country: string; commodity: string
  has_framework?: boolean
}

export default function TargetsPage() {
  const { canEdit } = useRole()
  const [year,         setYear]         = useState(String(BASELINE_YEAR))
  const [projects,     setProjects]     = useState<Project[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filterCountry,    setFilterCountry]    = useState('')
  const [filterCommodity,  setFilterCommodity]  = useState('')
  const [filterProject,    setFilterProject]    = useState('')
  const [search,           setSearch]           = useState('')
  const gridScroll = useRef(0)                                     // scroll position of the project grid
  const openedAtLength = useRef<number | null>(null)               // history.length right after a project was opened

  const load = useCallback(async () => {
    setLoading(true)
    const pRes = await fetch('/api/projects').then(r => r.json())
    setProjects(Array.isArray(pRes) ? pRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
          Each project&rsquo;s measurement framework · Network KPIs (S6.1–S6.5, S2.1, S2.5) are on the Network KPIs tab
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
            Projects · {gridProjects.length} — select a project to view its measurement framework
          </div>
          {gridGroups.map(grp => (<div key={grp.label} style={{ marginBottom: '.9rem' }}>
          <div style={{ fontSize: '.54rem', fontWeight: 700, color: '#888', margin: '.2rem 0 .4rem' }}>{grp.label} · {grp.items.length}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '.6rem' }}>
            {grp.items.map(p => {
              return (
                <button key={p.id} type="button" onClick={() => openProject(p.project_code)}
                  className="cc"
                  style={{ textAlign: 'left', cursor: 'pointer', padding: '.65rem .8rem', margin: 0, border: '1px solid #d0d0d0',
                           borderTop: '3px solid #FFC800', background: '#fff', display: 'flex', flexDirection: 'column', gap: '.25rem', minHeight: 96 }}>
                  <span style={{ fontSize: '.56rem', fontWeight: 800, letterSpacing: '1px', color: '#b8a800', textTransform: 'uppercase' }}>{p.project_code}</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#111', lineHeight: 1.25 }}>{p.project_name}</span>
                  <span style={{ fontSize: '.56rem', color: '#888', marginTop: 'auto' }}>{p.country} · {p.commodity}</span>
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
