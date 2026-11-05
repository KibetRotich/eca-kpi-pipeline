'use client'

/**
 * Annual report tracker (Sprint 62) — the default tab of /annual-reports.
 *
 * One row per project report in the selected cycle. The deadline the report is currently working towards
 * (see nextDeadline) is shown amber within 14 days and red once missed. Responsible staff update the status,
 * note and final report of their own rows; M&E Officers / Admins also add, edit and delete rows and start cycles.
 * Marking a report "Final filed" asks for the final report's Drive link, which is filed in the Library.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRole } from '@/lib/role-context'
import { REPORT_COUNTRIES, REPORT_TYPE_LABEL, parseDriveLink, reportOpenUrl } from '@/lib/annual-reports'
import {
  STATUS_LABEL, TRACKER_STATUSES, canEditRow, deadlineState, formatResponsible, nextDeadline,
  type DeadlineKey, type LinkedReport, type ReportCycle, type TrackerProject, type TrackerRow, type TrackerStatus,
} from '@/lib/report-tracker'
import PreviewLink from '@/components/DocPreview'
import styles from './annual.module.css'
import StaffPicker, { type Person } from './StaffPicker'

const DEADLINES: { key: DeadlineKey; label: string }[] = [
  { key: 'deadline_cm', label: 'CM Deadline' },
  { key: 'deadline_hop', label: 'HoP & MD Deadline' },
  { key: 'deadline_donor', label: 'Deadline to donor' },
]

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const showDate = (d: string | null) => (d ? fmt.format(new Date(d + 'T00:00:00Z')) : '—')

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data
}

interface Props {
  cycles: ReportCycle[]; cycle: ReportCycle | null; rows: TrackerRow[]; reports: LinkedReport[]
  projects: TrackerProject[]   // Projects' Progress
  today: string
}

export default function Tracker({ cycles, cycle, rows, reports, projects, today }: Props) {
  const router = useRouter()
  const { email, canEdit } = useRole()
  const [updating, setUpdating] = useState<TrackerRow | null>(null)
  const [presetStatus, setPresetStatus] = useState<TrackerStatus | undefined>()   // status chosen in the table before the dialog opened
  const [statusOverride, setStatusOverride] = useState<Record<string, TrackerStatus>>({})   // shown while a change saves
  const [savingId, setSavingId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<{ id: string; message: string } | null>(null)
  const [editing, setEditing] = useState<TrackerRow | 'new' | null>(null)
  const [newCycle, setNewCycle] = useState(false)

  const byId = useMemo(() => new Map(reports.map(r => [r.id, r])), [reports])
  const refresh = () => router.refresh()

  // The table's status dropdown. "Final filed" needs the final report's Drive link, so when none is linked yet
  // it opens the Update dialog with that status chosen instead of saving straight away.
  async function changeStatus(r: TrackerRow, next: TrackerStatus) {
    setStatusError(null)
    if (next === 'final_filed' && r.annual_report_ids.length === 0) {
      setPresetStatus(next); setUpdating(r)
      return
    }
    setStatusOverride(o => ({ ...o, [r.id]: next })); setSavingId(r.id)
    try {
      await send(`/api/report-tracker/${r.id}`, 'PATCH', { status: next })
      refresh()
    } catch (err) {
      setStatusOverride(o => { const c = { ...o }; delete c[r.id]; return c })
      setStatusError({ id: r.id, message: err instanceof Error ? err.message : 'Could not save the status' })
    } finally {
      setSavingId(null)
    }
  }

  // Drop optimistic values once the refreshed rows carry them.
  useEffect(() => {
    setStatusOverride(o => Object.fromEntries(Object.entries(o).filter(([id, st]) => rows.find(r => r.id === id)?.status !== st)))
  }, [rows])

  return (
    <>
      <div className={styles.filters}>
        <label>Reporting cycle
          <select value={cycle?.id ?? ''} onChange={e => router.push(`/annual-reports?cycle=${e.target.value}`)} disabled={!cycles.length}>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {canEdit && (
          <span className={styles.trackerActions}>
            {cycle && <button type="button" className={styles.secondary} onClick={() => setEditing('new')}>+ Add report</button>}
            <button type="button" className={styles.secondary} onClick={() => setNewCycle(true)}>New cycle</button>
          </span>
        )}
      </div>

      {!cycle ? (
        <div className={styles.empty}>No reporting cycle yet.{canEdit ? ' Start one with “New cycle”.' : ''}</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>No reports in {cycle.name} yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.tracker}>
            <thead>
              <tr>
                <th scope="col">Responsible</th>
                <th scope="col">Project &amp; report</th>
                {DEADLINES.map(d => <th key={d.key} scope="col">{d.label}</th>)}
                <th scope="col">Status</th>
                <th scope="col">Final report</th>
                <th scope="col"><span className={styles.srOnly}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const next = nextDeadline(r)
                const mine = canEditRow(r, email, canEdit)
                return (
                  <tr key={r.id}>
                    <td>{r.responsible_names.length ? r.responsible_names.join(', ') : <span className={styles.unassigned}>Not assigned</span>}</td>
                    <td>
                      <strong>{r.project}</strong>
                      <div className={styles.meta}>
                        <span className={`${styles.badge} ${r.report_type === 'donor' ? styles.donor : styles.country}`}>{REPORT_TYPE_LABEL[r.report_type]}</span>
                        {r.country && <span>{r.country}</span>}
                      </div>
                      {r.note && !r.note.startsWith('Imported from the Google Doc') && <div className={styles.note}>{r.note}</div>}
                    </td>
                    {DEADLINES.map(d => {
                      const v = r[d.key]
                      const state = v && d.key === next ? deadlineState(v, today) : null
                      return (
                        <td key={d.key} className={`${styles.date} ${state === 'overdue' ? styles.overdue : state === 'soon' ? styles.soon : ''} ${d.key === next ? styles.nextDate : ''}`}>
                          {showDate(v)}
                          {state === 'overdue' && <span className={styles.flag}>Overdue</span>}
                          {state === 'soon' && <span className={styles.flag}>Due soon</span>}
                        </td>
                      )
                    })}
                    <td>
                      {mine ? (() => {
                        const st = statusOverride[r.id] ?? r.status
                        return (
                          <>
                            <select className={`${styles.status} ${styles.statusSelect} ${styles['st_' + st]}`} value={st}
                                    disabled={savingId === r.id} aria-label={`Status of ${r.project}`}
                                    onChange={e => changeStatus(r, e.target.value as TrackerStatus)}>
                              {TRACKER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                            </select>
                            {savingId === r.id && <span className={styles.savingNote}>Saving…</span>}
                            {statusError?.id === r.id && <span className={styles.statusErr} role="alert">{statusError.message}</span>}
                          </>
                        )
                      })() : <span className={`${styles.status} ${styles['st_' + r.status]}`}>{STATUS_LABEL[r.status]}</span>}
                    </td>
                    <td>
                      {r.annual_report_ids.map(id => byId.get(id)).filter(Boolean).map(rep => (
                        <PreviewLink key={rep!.id} href={reportOpenUrl(rep!)} driveId={rep!.drive_file_id} fileType={rep!.file_type} title={rep!.title} className={styles.fileLink}>{rep!.title}</PreviewLink>
                      ))}
                    </td>
                    <td className={styles.rowActions}>
                      {mine && <button type="button" className={styles.linkBtn} onClick={() => { setPresetStatus(undefined); setUpdating(r) }}>Update</button>}
                      {canEdit && <button type="button" className={styles.linkBtn} onClick={() => setEditing(r)}>Edit</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {updating && cycle && (
        <UpdateModal row={updating} cycle={cycle} initialStatus={presetStatus} linked={updating.annual_report_ids.map(id => byId.get(id)).filter(Boolean) as LinkedReport[]}
                     onClose={() => { setUpdating(null); setPresetStatus(undefined) }}
                     onSaved={() => { setUpdating(null); setPresetStatus(undefined); refresh() }} />
      )}
      {editing && cycle && (
        <RowModal row={editing === 'new' ? null : editing} cycle={cycle} projects={projects}
                  onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
      {newCycle && (
        <CycleModal cycles={cycles} projectCount={projects.length} onClose={() => setNewCycle(false)}
                    onSaved={id => { setNewCycle(false); router.push(`/annual-reports?cycle=${id}`); refresh() }} />
      )}
    </>
  )
}

/* ── Shared modal frame ───────────────────────────────────────────────────── */
function Modal({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Status / final report (responsible staff and M&E) ────────────────────── */
function UpdateModal({ row, cycle, linked, initialStatus, onClose, onSaved }: {
  row: TrackerRow; cycle: ReportCycle; linked: LinkedReport[]; initialStatus?: TrackerStatus; onClose: () => void; onSaved: () => void
}) {
  const [status, setStatus] = useState<TrackerStatus>(initialStatus ?? row.status)
  const [note, setNote] = useState(row.note?.startsWith('Imported from the Google Doc') ? '' : row.note ?? '')
  const [link, setLink] = useState('')
  const [fileType, setFileType] = useState<'' | 'pdf' | 'docx'>('')
  const [title, setTitle] = useState(`${row.project} – ${cycle.year} Annual Report`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const drive = link.trim() ? parseDriveLink(link) : null
  const needsFinal = status === 'final_filed' && linked.length === 0

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const body: Record<string, unknown> = { status }
    const imported = row.note?.startsWith('Imported from the Google Doc')
    if (note.trim() !== (imported ? '' : row.note ?? '')) body.note = note
    if (link.trim()) {
      if (!drive) return setError('That is not a link to a single Drive file or Google Doc. Use Share → Copy link.')
      if (drive.type !== 'gdoc' && !fileType) return setError('Choose whether the final report is a PDF or a Word document.')
      body.final = { drive_url: link.trim(), file_type: drive.type ?? fileType, title }
    } else if (needsFinal) {
      return setError('Paste the Drive link of the final report to mark it Final filed.')
    }
    setBusy(true)
    try { await send(`/api/report-tracker/${row.id}`, 'PATCH', body); onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  async function unlink(id: string) {
    setBusy(true); setError(null)
    try { await send(`/api/report-tracker/${row.id}`, 'PATCH', { remove_report_id: id }); onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Update: ${row.project}`} busy={busy} onClose={onClose}>
      <form className={styles.form} onSubmit={save}>
        <label className={styles.field}>
          <span>Status</span>
          <select value={status} onChange={e => setStatus(e.target.value as TrackerStatus)}>
            {TRACKER_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>

        {linked.length > 0 && (
          <div className={styles.field}>
            <span>Final report{linked.length > 1 ? 's' : ''} filed</span>
            {linked.map(l => (
              <div key={l.id} className={styles.linkedRow}>
                <PreviewLink href={reportOpenUrl(l)} driveId={l.drive_file_id} fileType={l.file_type} title={l.title}>{l.title}</PreviewLink>
                <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => unlink(l.id)}>Unlink</button>
              </div>
            ))}
          </div>
        )}

        {(status === 'final_filed' || link) && (
          <fieldset className={styles.fieldset}>
            <legend>{linked.length ? 'Add another final report' : 'Final report'} {needsFinal && <span className={styles.req}>*</span>}</legend>
            <label className={styles.field}>
              <span className={styles.hint}>Save the final report in the ANNUAL REPORTS folder on the shared drive, then paste its link (Share → Copy link). It is added to the Library.</span>
              <input type="url" value={link} placeholder="https://drive.google.com/file/d/…" onChange={e => setLink(e.target.value)} aria-invalid={!!link.trim() && !drive} />
            </label>
            {drive && drive.type !== 'gdoc' && (
              <label className={styles.field}>
                <span>File type</span>
                <select value={fileType} onChange={e => setFileType(e.target.value as 'pdf' | 'docx')}>
                  <option value="" disabled>Select…</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word (.docx)</option>
                </select>
              </label>
            )}
            {link.trim() && (
              <label className={styles.field}>
                <span>Title in the Library</span>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} />
              </label>
            )}
          </fieldset>
        )}

        <label className={styles.field}>
          <span>Note <span className={styles.hint}>(optional, e.g. extension agreed with donor)</span></span>
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={2} />
        </label>

        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Add / edit a row (M&E Officers / Admins) ─────────────────────────────── */
const OTHER = '__other__'

function RowModal({ row, cycle, projects, onClose, onSaved }: {
  row: TrackerRow | null; cycle: ReportCycle; projects: TrackerProject[]; onClose: () => void; onSaved: () => void
}) {
  // A row tied to exactly one Projects' Progress project is edited through the dropdown; anything else
  // (several projects, or a non-project report such as the Internal REC report) through "Other".
  const single = row?.project_ids.length === 1 ? projects.find(p => p.id === row.project_ids[0]) : undefined
  const [pick, setPick] = useState(row ? (single ? single.id : OTHER) : '')
  const [project, setProject] = useState(row?.project ?? '')
  const [type, setType] = useState<'donor' | 'country'>(row?.report_type ?? 'donor')
  const [country, setCountry] = useState(row?.country ?? '')
  const [people, setPeople] = useState<Person[]>(row ? row.responsible_names.map((name, i) => ({ name, email: row.responsible_emails[i] ?? '' })) : [])
  const [dl, setDl] = useState<Record<DeadlineKey, string>>({
    deadline_cm: row?.deadline_cm ?? '', deadline_hop: row?.deadline_hop ?? '', deadline_donor: row?.deadline_donor ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!pick) return setError('Choose the project, or “Other” for a report that is not one project.')
    if (!people.length) return setError('Choose at least one responsible person.')
    const chosen = projects.find(p => p.id === pick)
    // "Other" keeps an existing row's project links (e.g. P2P Coffee = Kenya + Tanzania); a new "Other" row has none.
    const projectIds = chosen ? [chosen.id] : (row && !single ? row.project_ids : [])
    setBusy(true)
    const body = { project: chosen ? chosen.project_name : project, project_ids: projectIds,
      report_type: type, country: country || null,
      responsible: formatResponsible(people.map(p => p.name), people.map(p => p.email)),
      deadline_cm: dl.deadline_cm || null, deadline_hop: dl.deadline_hop || null, deadline_donor: dl.deadline_donor || null }
    try {
      if (row) await send(`/api/report-tracker/${row.id}`, 'PATCH', body)
      else await send('/api/report-tracker', 'POST', { ...body, cycle_id: cycle.id })
      onSaved()
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!row || !confirm(`Remove "${row.project}" from ${cycle.name}? Filed reports stay in the Library.`)) return
    setBusy(true); setError(null)
    try { await send(`/api/report-tracker/${row.id}`, 'DELETE'); onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={row ? `Edit: ${row.project}` : `Add report to ${cycle.name}`} busy={busy} onClose={onClose}>
      <form className={styles.form} onSubmit={save}>
        <label className={styles.field}>
          <span>Project <span className={styles.req}>*</span> <span className={styles.hint}>(from Projects’ Progress)</span></span>
          <select value={pick} required onChange={e => {
            const v = e.target.value
            setPick(v)
            const p = projects.find(x => x.id === v)
            if (p && (REPORT_COUNTRIES as readonly string[]).includes(p.country)) setCountry(p.country)
          }}>
            <option value="" disabled>Select…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name} ({p.country})</option>)}
            <option value={OTHER}>Other: not one project (e.g. Internal REC report, or several projects)</option>
          </select>
        </label>
        {pick === OTHER && (
          <label className={styles.field}>
            <span>Report name <span className={styles.req}>*</span></span>
            <input type="text" value={project} onChange={e => setProject(e.target.value)} required minLength={2} maxLength={200} />
          </label>
        )}
        <div className={styles.row2}>
          <label className={styles.field}>
            <span>Report type</span>
            <select value={type} onChange={e => setType(e.target.value as 'donor' | 'country')}>
              <option value="donor">{REPORT_TYPE_LABEL.donor}</option>
              <option value="country">{REPORT_TYPE_LABEL.country}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Country</span>
            <select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">Not set</option>
              {REPORT_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.field}>
          <span>Responsible <span className={styles.req}>*</span> <span className={styles.hint}>they can then update this report themselves</span></span>
          <StaffPicker value={people} onChange={setPeople} />
        </div>
        <div className={styles.row3}>
          {DEADLINES.map(d => (
            <label key={d.key} className={styles.field}>
              <span>{d.label}</span>
              <input type="date" value={dl[d.key]} onChange={e => setDl({ ...dl, [d.key]: e.target.value })} />
            </label>
          ))}
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.actions}>
          {row && <button type="button" className={styles.danger} onClick={remove} disabled={busy}>Remove</button>}
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Saving…' : row ? 'Save' : 'Add report'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ── New reporting cycle (M&E Officers / Admins) ──────────────────────────── */
function CycleModal({ cycles, projectCount, onClose, onSaved }: {
  cycles: ReportCycle[]; projectCount: number; onClose: () => void; onSaved: (id: string) => void
}) {
  const nextYear = (cycles[0]?.year ?? new Date().getFullYear() - 1) + 1
  const [year, setYear] = useState(String(nextYear))
  const [name, setName] = useState(`${nextYear} Annual Reports`)
  const [carryFrom, setCarryFrom] = useState(cycles[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const d = await send('/api/report-tracker/cycles', 'POST', { name, year: Number(year), carry_from: carryFrom || null })
      onSaved(d.id)
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong') }
    finally { setBusy(false) }
  }

  return (
    <Modal title="New reporting cycle" busy={busy} onClose={onClose}>
      <form className={styles.form} onSubmit={save}>
        <div className={styles.row2}>
          <label className={styles.field}>
            <span>Reporting year</span>
            <input type="number" value={year} min={2015} max={2100} required
                   onChange={e => { setYear(e.target.value); setName(`${e.target.value} Annual Reports`) }} />
          </label>
          <label className={styles.field}>
            <span>Cycle name</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required minLength={3} maxLength={100} />
          </label>
        </div>
        <p className={styles.hint}>
          The cycle lists the {projectCount} projects in Projects’ Progress, each “Not started” with no deadlines.
          Add the deadlines with “Edit”, and reports that are not one project (e.g. the Internal REC report) with “Add report”.
        </p>
        <label className={styles.field}>
          <span>Responsible staff</span>
          <select value={carryFrom} onChange={e => setCarryFrom(e.target.value)}>
            <option value="">Leave unassigned</option>
            {cycles.map(c => <option key={c.id} value={c.id}>Carry over from {c.name} (matched by project)</option>)}
          </select>
        </label>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Creating…' : 'Create cycle'}</button>
        </div>
      </form>
    </Modal>
  )
}
