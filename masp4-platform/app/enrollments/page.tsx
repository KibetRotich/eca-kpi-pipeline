'use client'

/**
 * /enrollments — Enrollment figures entry
 * Managers enter enrolled_total / enrolled_female / enrolled_male
 * per project × year so the dashboard can extrapolate from samples.
 */

import { useState, useEffect, useCallback } from 'react'

const YEARS = [2026, 2027, 2028, 2029, 2030]

interface Project {
  id:           string
  project_code: string
  project_name: string
  country:      string
  commodity:    string
}

interface Enrollment {
  id:              string
  survey_year:     number
  enrolled_total:  number
  enrolled_female: number | null
  enrolled_male:   number | null
  data_source:     string | null
  notes:           string | null
  updated_at:      string
  projects:        Project
}

interface EditState {
  enrolled_total:   string
  enrolled_female:  string
  enrolled_male:    string
  data_source:      string
  notes:            string
}

const EMPTY_EDIT: EditState = {
  enrolled_total: '', enrolled_female: '', enrolled_male: '',
  data_source: '', notes: '',
}

function fmt(n: number | null | undefined) {
  return n != null ? n.toLocaleString() : '—'
}

export default function EnrollmentsPage() {
  const [projects,    setProjects]    = useState<Project[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState<string | null>(null)   // "projectId:year"
  const [editing,     setEditing]     = useState<string | null>(null)   // "projectId:year"
  const [editVals,    setEditVals]    = useState<EditState>(EMPTY_EDIT)
  const [saveMsg,     setSaveMsg]     = useState<{ key: string; ok: boolean; msg: string } | null>(null)
  const [filterCountry,   setFilterCountry]   = useState('')
  const [filterCommodity, setFilterCommodity] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [pRes, eRes] = await Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/enrollments').then(r => r.json()),
    ])
    setProjects(Array.isArray(pRes) ? pRes : [])
    setEnrollments(Array.isArray(eRes) ? eRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function enrollmentKey(projectId: string, year: number) {
    return `${projectId}:${year}`
  }

  function findEnrollment(projectId: string, year: number): Enrollment | undefined {
    return enrollments.find(e => e.projects?.id === projectId && e.survey_year === year)
  }

  function startEdit(projectId: string, year: number) {
    const existing = findEnrollment(projectId, year)
    setEditVals(existing ? {
      enrolled_total:  String(existing.enrolled_total),
      enrolled_female: existing.enrolled_female != null ? String(existing.enrolled_female) : '',
      enrolled_male:   existing.enrolled_male   != null ? String(existing.enrolled_male)   : '',
      data_source:     existing.data_source ?? '',
      notes:           existing.notes ?? '',
    } : EMPTY_EDIT)
    setEditing(enrollmentKey(projectId, year))
    setSaveMsg(null)
  }

  async function save(projectId: string, year: number) {
    const key = enrollmentKey(projectId, year)
    setSaving(key)
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id:      projectId,
          survey_year:     year,
          enrolled_total:  Number(editVals.enrolled_total),
          enrolled_female: editVals.enrolled_female !== '' ? Number(editVals.enrolled_female) : null,
          enrolled_male:   editVals.enrolled_male   !== '' ? Number(editVals.enrolled_male)   : null,
          data_source:     editVals.data_source || null,
          notes:           editVals.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveMsg({ key, ok: false, msg: json.error ?? 'Save failed' })
      } else {
        setSaveMsg({ key, ok: true, msg: 'Saved' })
        setEditing(null)
        await load()
      }
    } catch {
      setSaveMsg({ key, ok: false, msg: 'Network error' })
    } finally {
      setSaving(null)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this enrollment record?')) return
    await fetch(`/api/enrollments?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const countries  = [...new Set(projects.map(p => p.country))].sort()
  const commodities = [...new Set(projects.map(p => p.commodity))].sort()

  const visible = projects.filter(p =>
    (!filterCountry   || p.country   === filterCountry) &&
    (!filterCommodity || p.commodity === filterCommodity)
  )

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: '.9rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111' }}>Enrollment Figures</div>
        <div style={{ fontSize: '.58rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 2 }}>
          Programme population per project × year — used to extrapolate from sample surveys
        </div>
      </div>

      {/* Info box */}
      <div style={{
        background: '#fffce8', border: '1px solid #f0d800', borderLeft: '4px solid #FFC800',
        padding: '.6rem 1rem', marginBottom: '.9rem', fontSize: '.68rem', fontWeight: 600, color: '#555', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#000' }}>How extrapolation works:</strong>
        <ul style={{ marginTop: '.3rem', paddingLeft: '1.1rem', marginBottom: 0 }}>
          <li>Enter <strong>enrolled_total</strong> = total programme participants registered for that project × year.</li>
          <li>Enter <strong>Female</strong> and <strong>Male</strong> sub-totals for stratified estimates (recommended).</li>
          <li>Dashboard KPI counts = <em>sample rate × enrolled population</em> per gender stratum.</li>
          <li>If only total is entered, a simple ratio estimator is used instead.</li>
        </ul>
      </div>

      {/* Filters */}
      <div style={{
        background: '#fff', border: '1px solid #d0d0d0',
        padding: '.45rem .75rem', marginBottom: '.9rem',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.45rem 1rem',
      }}>
        <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#666' }}>Filter:</span>
        {[
          { label: 'Country',   value: filterCountry,   opts: countries,   set: setFilterCountry,   ph: 'All countries' },
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
        {(filterCountry || filterCommodity) && (
          <button className="btn-secondary" onClick={() => { setFilterCountry(''); setFilterCommodity('') }} style={{ marginLeft: 'auto' }}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: '.7rem', color: '#888', padding: '1.5rem 0' }}>Loading…</div>
      ) : (
        visible.map(project => (
          <div key={project.id} className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>

            {/* Project header */}
            <div style={{
              background: '#111', color: '#fff',
              padding: '.5rem .9rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#FFC800', marginRight: '.5rem' }}>
                  {project.project_code}
                </span>
                <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#fff' }}>{project.project_name}</span>
              </div>
              <div style={{ fontSize: '.56rem', color: '#aaa', letterSpacing: '.5px' }}>
                {project.country} · {project.commodity}
              </div>
            </div>

            {/* Year rows */}
            <table style={{ fontSize: '.68rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', width: 60 }}>Year</th>
                  <th style={{ textAlign: 'right' }}>Total enrolled</th>
                  <th style={{ textAlign: 'right' }}>Female</th>
                  <th style={{ textAlign: 'right' }}>Male</th>
                  <th style={{ textAlign: 'left' }}>Source</th>
                  <th style={{ textAlign: 'left' }}>Notes</th>
                  <th style={{ textAlign: 'right', width: 90 }}>Updated</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {YEARS.map((year, yi) => {
                  const enr = findEnrollment(project.id, year)
                  const key = enrollmentKey(project.id, year)
                  const isEditing = editing === key
                  const isSaving  = saving  === key
                  const msg       = saveMsg?.key === key ? saveMsg : null

                  return (
                    <tr key={year} style={{ background: yi % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ fontWeight: 800, color: '#333' }}>{year}</td>

                      {isEditing ? (
                        <>
                          <td>
                            <input
                              type="number" min={1} placeholder="Required"
                              value={editVals.enrolled_total}
                              onChange={e => setEditVals(v => ({ ...v, enrolled_total: e.target.value }))}
                              style={{ width: 90, textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min={0} placeholder="Optional"
                              value={editVals.enrolled_female}
                              onChange={e => setEditVals(v => ({ ...v, enrolled_female: e.target.value }))}
                              style={{ width: 80, textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min={0} placeholder="Optional"
                              value={editVals.enrolled_male}
                              onChange={e => setEditVals(v => ({ ...v, enrolled_male: e.target.value }))}
                              style={{ width: 80, textAlign: 'right' }}
                            />
                          </td>
                          <td>
                            <input
                              type="text" placeholder="e.g. Project MIS"
                              value={editVals.data_source}
                              onChange={e => setEditVals(v => ({ ...v, data_source: e.target.value }))}
                              style={{ width: 120 }}
                            />
                          </td>
                          <td colSpan={2}>
                            <input
                              type="text" placeholder="Optional notes"
                              value={editVals.notes}
                              onChange={e => setEditVals(v => ({ ...v, notes: e.target.value }))}
                              style={{ width: 180 }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn-primary"
                              style={{ padding: '.2rem .6rem', fontSize: '.6rem', marginRight: 4 }}
                              disabled={isSaving || !editVals.enrolled_total}
                              onClick={() => save(project.id, year)}
                            >
                              {isSaving ? '…' : 'Save'}
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '.2rem .5rem', fontSize: '.6rem' }}
                              onClick={() => { setEditing(null); setSaveMsg(null) }}
                            >
                              ✕
                            </button>
                            {msg && (
                              <div style={{ fontSize: '.56rem', color: msg.ok ? '#2e7d32' : '#c62828', marginTop: 2 }}>{msg.msg}</div>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ textAlign: 'right', fontWeight: enr ? 700 : 400, fontVariantNumeric: 'tabular-nums', color: enr ? '#111' : '#ccc' }}>
                            {enr ? enr.enrolled_total.toLocaleString() : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: enr?.enrolled_female != null ? '#1a3557' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(enr?.enrolled_female)}
                          </td>
                          <td style={{ textAlign: 'right', color: enr?.enrolled_male != null ? '#555' : '#ccc', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(enr?.enrolled_male)}
                          </td>
                          <td style={{ color: '#888' }}>{enr?.data_source ?? <span style={{ color: '#ddd' }}>—</span>}</td>
                          <td style={{ color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {enr?.notes ?? <span style={{ color: '#ddd' }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', color: '#aaa', whiteSpace: 'nowrap' }}>
                            {enr ? new Date(enr.updated_at).toLocaleDateString() : ''}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              className="btn-secondary"
                              style={{ padding: '.2rem .55rem', fontSize: '.6rem', marginRight: enr ? 4 : 0 }}
                              onClick={() => startEdit(project.id, year)}
                            >
                              {enr ? 'Edit' : '+ Add'}
                            </button>
                            {enr && (
                              <button
                                style={{ padding: '.2rem .45rem', fontSize: '.6rem', background: 'none', border: '1px solid #ef9a9a', color: '#c62828', cursor: 'pointer' }}
                                onClick={() => remove(enr.id)}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
