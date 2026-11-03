'use client'

/**
 * Filterable list of annual report links, grouped by year (Sprint 61).
 * M&E Officers / Admins also see "Remove" on each row (DELETE /api/annual-reports/<id>; Drive is untouched).
 */
import { useMemo, useState } from 'react'
import { useRole } from '@/lib/role-context'
import { REPORT_TYPE_LABEL, type AnnualReport } from '@/lib/annual-reports'
import styles from './annual.module.css'

const FILE_LABEL = { pdf: 'PDF', docx: 'Word', gdoc: 'Google Doc' } as const

export default function ReportBrowser({ reports }: { reports: AnnualReport[] }) {
  const { canEdit } = useRole()
  const [rows, setRows] = useState(reports)
  const [type, setType] = useState('')
  const [country, setCountry] = useState('')
  const [year, setYear] = useState('')
  const [programme, setProgramme] = useState('')
  const [q, setQ] = useState('')

  const countries = useMemo(() => [...new Set(rows.map(r => r.country))].sort(), [rows])
  const years = useMemo(() => [...new Set(rows.map(r => r.year))].sort((a, b) => b - a), [rows])
  const programmes = useMemo(() => [...new Set(rows.map(r => r.programme))].sort(), [rows])

  const needle = q.trim().toLowerCase()
  const shown = rows.filter(r =>
    (!type || r.report_type === type) &&
    (!country || r.country === country) &&
    (!year || String(r.year) === year) &&
    (!programme || r.programme === programme) &&
    (!needle || `${r.title} ${r.programme}`.toLowerCase().includes(needle)))

  const byYear = new Map<number, AnnualReport[]>()
  for (const r of shown) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r])

  const filtered = !!(type || country || year || programme || needle)

  async function remove(r: AnnualReport) {
    if (!confirm(`Remove "${r.title}" from the list? The file stays in Google Drive.`)) return
    const res = await fetch(`/api/annual-reports/${r.id}`, { method: 'DELETE' })
    if (res.ok) setRows(rows.filter(x => x.id !== r.id))
    else alert((await res.json().catch(() => null))?.error ?? 'Could not remove the report')
  }

  return (
    <>
      <div className={styles.filters}>
        <label>Report type
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="">All</option>
            <option value="donor">{REPORT_TYPE_LABEL.donor}</option>
            <option value="country">{REPORT_TYPE_LABEL.country}</option>
          </select>
        </label>
        <label>Country
          <select value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Year
          <select value={year} onChange={e => setYear(e.target.value)}>
            <option value="">All</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>Programme
          <select value={programme} onChange={e => setProgramme(e.target.value)}>
            <option value="">All</option>
            {programmes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Search
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Title or programme" />
        </label>
        <span className={styles.count}>{shown.length} of {rows.length} reports</span>
        {filtered && (
          <button type="button" className={styles.clear}
                  onClick={() => { setType(''); setCountry(''); setYear(''); setProgramme(''); setQ('') }}>
            Clear
          </button>
        )}
      </div>

      {shown.length === 0 && <div className={styles.empty}>No reports match these filters.</div>}

      {[...byYear.entries()].map(([y, list]) => (
        <section key={y} className={styles.year}>
          <h2>{y} <span>{list.length} report{list.length === 1 ? '' : 's'}</span></h2>
          <ul className={styles.list}>
            {list.map(r => (
              <li key={r.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <a href={r.source_url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a>
                  <div className={styles.meta}>
                    <span className={`${styles.badge} ${r.report_type === 'donor' ? styles.donor : styles.country}`}>
                      {REPORT_TYPE_LABEL[r.report_type]}
                    </span>
                    <span>{r.programme}</span>
                    <span>· {r.country}</span>
                    {r.period_label && <span>· {r.period_label}</span>}
                  </div>
                </div>
                <span className={styles.fileType}>{FILE_LABEL[r.file_type]}</span>
                {canEdit && (
                  <button type="button" className={styles.remove} onClick={() => remove(r)}
                          aria-label={`Remove ${r.title}`}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
