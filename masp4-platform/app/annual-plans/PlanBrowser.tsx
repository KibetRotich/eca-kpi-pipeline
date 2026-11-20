'use client'

/**
 * Annual Plans & Budgets — list of files for one sub-tab, grouped by plan year (Sprint 69).
 * The only filter is Scope (project / regional).
 * Admins only also see "Remove" on each row (DELETE /api/annual-plans/<id>; Drive is untouched).
 */
import { useMemo, useState } from 'react'
import { useRole } from '@/lib/role-context'
import PreviewLink, { type DriveFileType } from '@/components/DocPreview'
import {
  DOC_KIND_LABEL, FILE_TYPE_LABEL, SCOPE_LABEL, SUBTAB_KINDS, planOpenUrl,
  type AnnualPlan, type PlanSubTab,
} from '@/lib/annual-plans'
import styles from './plans.module.css'

const PREVIEW_TYPE: Partial<Record<AnnualPlan['file_type'], DriveFileType>> = {
  pdf: 'pdf', docx: 'docx', gdoc: 'gdoc', gsheet: 'gsheet', gslides: 'gslides',
}

export default function PlanBrowser({ plans, tab }: { plans: AnnualPlan[]; tab: PlanSubTab }) {
  const { role } = useRole()
  const isAdmin = role === 'admin'          // Remove is Admin-only (Nov 2026)
  const [all, setAll] = useState(plans)
  const [scope, setScope] = useState('')

  const rows = useMemo(() => all.filter(p => SUBTAB_KINDS[tab].includes(p.doc_kind)), [all, tab])
  const shown = rows.filter(r => !scope || r.scope === scope)
  const noun = tab === 'plans' ? 'files' : 'budgets'

  async function remove(r: AnnualPlan) {
    if (!confirm(`Remove "${r.title}" from the list? The file stays in Google Drive.`)) return
    const res = await fetch(`/api/annual-plans/${r.id}`, { method: 'DELETE' })
    if (res.ok) setAll(all.filter(x => x.id !== r.id))
    else alert((await res.json().catch(() => null))?.error ?? 'Could not remove the file')
  }

  return (
    <>
      <div className={styles.filters}>
        <label>Scope
          <select value={scope} onChange={e => setScope(e.target.value)}>
            <option value="">All</option>
            <option value="project">{SCOPE_LABEL.project}</option>
            <option value="regional">{SCOPE_LABEL.regional}</option>
          </select>
        </label>
        <span className={styles.count}>{shown.length} {noun}</span>
      </div>

      <List rows={shown} canRemove={isAdmin} onRemove={remove} />
    </>
  )
}

function List({ rows, canRemove, onRemove }: { rows: AnnualPlan[]; canRemove: boolean; onRemove: (r: AnnualPlan) => void }) {
  if (rows.length === 0) return <div className={styles.empty}>Nothing to show.</div>
  const byYear = new Map<number, AnnualPlan[]>()
  for (const r of rows) byYear.set(r.plan_year, [...(byYear.get(r.plan_year) ?? []), r])

  return (
    <>
      {[...byYear.entries()].map(([y, list]) => (
        <section key={y} className={styles.year}>
          <h2>{y} <span>{list.length} file{list.length === 1 ? '' : 's'}</span></h2>
          <div className={styles.tableWrap}>
            <table className={styles.planTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.colTitle}>Title</th>
                  <th scope="col" className={styles.colProject}>Project</th>
                  <th scope="col">Country</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">File</th>
                  {canRemove && <th scope="col"><span className={styles.srOnly}>Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <td className={styles.colTitle}>
                      <PreviewLink href={planOpenUrl(r)} driveId={r.drive_file_id} fileType={PREVIEW_TYPE[r.file_type] ?? null} title={r.title} className={styles.titleLink}>{r.title}</PreviewLink>
                      {r.period_label && <span className={styles.period}>{r.period_label}</span>}
                    </td>
                    <td className={styles.colProject}>
                      {r.programme}
                      {r.scope === 'regional' && <span className={styles.period}>Regional plan</span>}
                    </td>
                    <td className={styles.nowrap}>{r.country}</td>
                    <td><span className={`${styles.badge} ${r.doc_kind === 'supporting' ? styles.supporting : styles.kind}`}>{DOC_KIND_LABEL[r.doc_kind]}</span></td>
                    <td><span className={`${styles.badge} ${r.status === 'final' ? styles.final : styles.draft}`}>{r.status === 'final' ? 'Final' : 'Draft'}</span></td>
                    <td className={styles.nowrap}>
                      <a href={planOpenUrl(r)} target="_blank" rel="noopener noreferrer" className={styles.fileOpen}
                         title="Open the file in Google Drive (new tab)">{FILE_TYPE_LABEL[r.file_type]} ↗</a>
                    </td>
                    {canRemove && (
                      <td className={styles.nowrap}>
                        <button type="button" className={styles.remove} onClick={() => onRemove(r)} aria-label={`Remove ${r.title}`}>Remove</button>
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
