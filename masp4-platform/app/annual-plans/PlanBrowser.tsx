'use client'

/**
 * Annual Plans & Budgets — list of files for one sub-tab, grouped by plan year (Sprint 69).
 * The only filter is Scope (project / regional).
 * M&E Officers / Admins also see "Remove" on each row (DELETE /api/annual-plans/<id>; Drive is untouched).
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
const OFFICE = new Set(['docx', 'doc', 'xlsx', 'xls', 'xlsm', 'pptx'])

export default function PlanBrowser({ plans, tab }: { plans: AnnualPlan[]; tab: PlanSubTab }) {
  const { canEdit } = useRole()
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

      <List rows={shown} canEdit={canEdit} onRemove={remove} />
    </>
  )
}

function List({ rows, canEdit, onRemove }: { rows: AnnualPlan[]; canEdit: boolean; onRemove: (r: AnnualPlan) => void }) {
  if (rows.length === 0) return <div className={styles.empty}>Nothing to show.</div>
  const byYear = new Map<number, AnnualPlan[]>()
  for (const r of rows) byYear.set(r.plan_year, [...(byYear.get(r.plan_year) ?? []), r])

  return (
    <>
      {[...byYear.entries()].map(([y, list]) => (
        <section key={y} className={styles.year}>
          <h2>{y} <span>{list.length} file{list.length === 1 ? '' : 's'}</span></h2>
          <ul className={styles.list}>
            {list.map(r => (
              <li key={r.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <PreviewLink href={planOpenUrl(r)} driveId={r.drive_file_id} fileType={PREVIEW_TYPE[r.file_type] ?? null} title={r.title}>{r.title}</PreviewLink>
                  <div className={styles.meta}>
                    <span className={`${styles.badge} ${r.doc_kind === 'supporting' ? styles.supporting : styles.kind}`}>{DOC_KIND_LABEL[r.doc_kind]}</span>
                    <span className={`${styles.badge} ${r.status === 'final' ? styles.final : styles.draft}`}>{r.status === 'final' ? 'Final' : 'Draft'}</span>
                    <span>{r.programme}</span>
                    <span>· {r.country}</span>
                    {r.scope === 'regional' && <span>· Regional plan</span>}
                    {r.period_label && <span>· {r.period_label}</span>}
                  </div>
                </div>
                <span className={styles.fileType}>
                  {FILE_TYPE_LABEL[r.file_type]}
                  {OFFICE.has(r.file_type) && (
                    <> · <a href={r.source_url} target="_blank" rel="noopener noreferrer" title="Open the file page in Google Drive">Drive</a></>
                  )}
                </span>
                {canEdit && (
                  <button type="button" className={styles.remove} onClick={() => onRemove(r)} aria-label={`Remove ${r.title}`}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
