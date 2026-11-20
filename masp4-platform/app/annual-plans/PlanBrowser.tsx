'use client'

/**
 * Annual Plans & Budgets — list and coverage grid for one sub-tab (Sprint 69). The only filter is Scope
 * (project / regional). List: files grouped by plan year. Coverage: one row per programme × one column per year
 * (Final / Draft only / Missing).
 * M&E Officers / Admins also see "Remove" on each row (DELETE /api/annual-plans/<id>; Drive is untouched).
 */
import { useMemo, useState } from 'react'
import { useRole } from '@/lib/role-context'
import PreviewLink, { type DriveFileType } from '@/components/DocPreview'
import {
  DOC_KIND_LABEL, FILE_TYPE_LABEL, SCOPE_LABEL, SUBTAB_KINDS, buildCoverage, planOpenUrl,
  type AnnualPlan, type CoverageCell, type PlanSubTab,
} from '@/lib/annual-plans'
import styles from './plans.module.css'

const PREVIEW_TYPE: Partial<Record<AnnualPlan['file_type'], DriveFileType>> = {
  pdf: 'pdf', docx: 'docx', gdoc: 'gdoc', gsheet: 'gsheet', gslides: 'gslides',
}
const OFFICE = new Set(['docx', 'doc', 'xlsx', 'xls', 'xlsm', 'pptx'])
const CELL_MARK: Record<Exclude<CoverageCell, null>, string> = { final: '✓', draft: 'D', missing: '–' }
const CELL_LABEL: Record<Exclude<CoverageCell, null>, string> = { final: 'Final', draft: 'Draft only', missing: 'Missing' }

export default function PlanBrowser({ plans, tab, initialView }: { plans: AnnualPlan[]; tab: PlanSubTab; initialView: 'list' | 'coverage' }) {
  const { canEdit } = useRole()
  const [all, setAll] = useState(plans)
  const [view, setView] = useState(initialView)
  const [scope, setScope] = useState('')

  const rows = useMemo(() => all.filter(p => SUBTAB_KINDS[tab].includes(p.doc_kind)), [all, tab])
  const shown = rows.filter(r => !scope || r.scope === scope)
  const noun = tab === 'plans' ? 'files' : 'budgets'

  function switchView(v: 'list' | 'coverage') {
    setView(v)
    const url = new URL(window.location.href)
    if (v === 'coverage') url.searchParams.set('view', 'coverage'); else url.searchParams.delete('view')
    window.history.replaceState(null, '', url)
  }

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
        {view === 'list' && <span className={styles.count}>{shown.length} {noun}</span>}
        <div className={styles.viewSwitch} role="group" aria-label="View">
          <button type="button" className={view === 'list' ? styles.viewOn : undefined} aria-pressed={view === 'list'} onClick={() => switchView('list')}>List</button>
          <button type="button" className={view === 'coverage' ? styles.viewOn : undefined} aria-pressed={view === 'coverage'} onClick={() => switchView('coverage')}>Coverage</button>
        </div>
      </div>

      {view === 'coverage'
        ? <Coverage plans={shown} tab={tab} />
        : <List rows={shown} canEdit={canEdit} onRemove={remove} />}
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

function Coverage({ plans, tab }: { plans: AnnualPlan[]; tab: PlanSubTab }) {
  const { years, rows } = useMemo(() => buildCoverage(plans, tab), [plans, tab])
  if (rows.length === 0) return <div className={styles.empty}>Nothing to show.</div>

  const groups: { scope: 'project' | 'regional'; items: typeof rows }[] = [
    { scope: 'regional', items: rows.filter(r => r.scope === 'regional') },
    { scope: 'project', items: rows.filter(r => r.scope === 'project') },
  ]
  const what = tab === 'plans' ? 'plan' : 'budget'

  return (
    <>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={`${styles.cell} ${styles.c_final}`}>{CELL_MARK.final}</i> Final {what}</span>
        <span><i className={`${styles.cell} ${styles.c_draft}`}>{CELL_MARK.draft}</i> Draft only</span>
        <span><i className={`${styles.cell} ${styles.c_missing}`}>{CELL_MARK.missing}</i> Missing</span>
        <span>Blank = before the programme’s first or after its last {what} on file</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.coverage}>
          <thead>
            <tr>
              <th className={styles.prog} scope="col">Programme</th>
              {years.map(y => <th key={y} scope="col">{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.filter(g => g.items.length).map(g => (
              <FragmentRows key={g.scope} label={SCOPE_LABEL[g.scope]} span={years.length + 1}>
                {g.items.map(r => (
                  <tr key={`${r.scope}|${r.programme}`}>
                    <th className={styles.prog} scope="row">{r.programme}</th>
                    {years.map(y => {
                      const c = r.cells[y]
                      if (!c) return <td key={y} />
                      const label = `${r.programme}, ${y}: ${CELL_LABEL[c]}`
                      return (
                        <td key={y}>
                          <span className={`${styles.cell} ${styles[`c_${c}`]}`} title={label} aria-label={label} role="img">{CELL_MARK[c]}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </FragmentRows>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.coverageNote}>
        Coverage is worked out from the files registered here, by plan year. A combined workplan + budget file counts for both Plans and Budgets; supporting documents do not count.
      </p>
    </>
  )
}

function FragmentRows({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className={styles.group}><th colSpan={span} scope="colgroup">{label}</th></tr>
      {children}
    </>
  )
}
