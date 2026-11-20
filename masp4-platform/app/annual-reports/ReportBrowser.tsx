'use client'

/**
 * Annual report links as one table per year (Sprint 61); Report type is the only filter (Nov 2026).
 * M&E Officers / Admins also see "Remove" on each row (DELETE /api/annual-reports/<id>; Drive is untouched).
 */
import { useState } from 'react'
import { useRole } from '@/lib/role-context'
import { REPORT_TYPE_LABEL, reportOpenUrl, type AnnualReport } from '@/lib/annual-reports'
import PreviewLink from '@/components/DocPreview'
import styles from './annual.module.css'

const FILE_LABEL = { pdf: 'PDF', docx: 'Word', gdoc: 'Google Doc' } as const

export default function ReportBrowser({ reports }: { reports: AnnualReport[] }) {
  const { canEdit } = useRole()
  const [rows, setRows] = useState(reports)
  const [type, setType] = useState('')

  const shown = rows.filter(r => !type || r.report_type === type)
  const byYear = new Map<number, AnnualReport[]>()
  for (const r of shown) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r])

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
        <span className={styles.count}>{shown.length} report{shown.length === 1 ? '' : 's'}</span>
      </div>

      {shown.length === 0 && <div className={styles.empty}>No reports to show.</div>}

      {[...byYear.entries()].map(([y, list]) => (
        <section key={y} className={styles.year}>
          <h2>{y} <span>{list.length} report{list.length === 1 ? '' : 's'}</span></h2>
          <div className={styles.tableWrap}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.colTitle}>Title</th>
                  <th scope="col" className={styles.colProject}>Project</th>
                  <th scope="col">Country</th>
                  <th scope="col">Report type</th>
                  <th scope="col">File</th>
                  {canEdit && <th scope="col"><span className={styles.srOnly}>Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td className={styles.colTitle}>
                      <PreviewLink href={reportOpenUrl(r)} driveId={r.drive_file_id} fileType={r.file_type} title={r.title} className={styles.titleLink}>{r.title}</PreviewLink>
                      {r.period_label && <span className={styles.period}>{r.period_label}</span>}
                    </td>
                    <td className={styles.colProject}>{r.programme}</td>
                    <td className={styles.nowrap}>{r.country}</td>
                    <td>
                      <span className={`${styles.badge} ${r.report_type === 'donor' ? styles.donor : styles.country}`}>
                        {REPORT_TYPE_LABEL[r.report_type]}
                      </span>
                    </td>
                    <td className={styles.nowrap}>
                      <a href={reportOpenUrl(r)} target="_blank" rel="noopener noreferrer" className={styles.fileOpen}
                         title="Open the file in Google Drive (new tab)">{FILE_LABEL[r.file_type]} ↗</a>
                    </td>
                    {canEdit && (
                      <td className={styles.nowrap}>
                        <button type="button" className={styles.remove} onClick={() => remove(r)} aria-label={`Remove ${r.title}`}>Remove</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}
