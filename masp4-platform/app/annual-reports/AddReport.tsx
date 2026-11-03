'use client'

/**
 * "Add Report" button + modal for /annual-reports (Sprint 61).
 * Shown only to signed-in Solidaridad staff (the API enforces the same rule).
 * Staff paste the Drive link of a donor or country annual report and its details; nothing is copied.
 */
import { useEffect, useRef, useState } from 'react'
import { useRole } from '@/lib/role-context'
import {
  MIN_REPORT_YEAR, PROGRAMME_OTHER, REPORT_COUNTRIES, REPORT_TYPE_LABEL, isStaffEmail, parseDriveLink,
} from '@/lib/annual-reports'
import styles from './annual.module.css'

type Project = { id: string; project_code: string; project_name: string; country: string }

export default function AddReport() {
  const { email, loading } = useRole()
  const [open, setOpen] = useState(false)
  if (loading || !isStaffEmail(email)) return null

  return (
    <>
      <button type="button" className={styles.addBtn} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> Add Report
      </button>
      {open && <AddReportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AddReportModal({ onClose }: { onClose: () => void }) {
  const thisYear = new Date().getFullYear()
  const [projects, setProjects] = useState<Project[]>([])
  const [link, setLink] = useState('')
  const [fileType, setFileType] = useState<'' | 'pdf' | 'docx'>('')
  const [title, setTitle] = useState('')
  const [reportType, setReportType] = useState<'' | 'donor' | 'country'>('')
  const [programme, setProgramme] = useState('')
  const [programmeOther, setProgrammeOther] = useState('')
  const [country, setCountry] = useState('')
  const [year, setYear] = useState(String(thisYear - 1))
  const [period, setPeriod] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstField.current?.focus()
    fetch('/api/projects').then(r => r.json()).then(d => Array.isArray(d) && setProjects(d)).catch(() => {})
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const drive = link.trim() ? parseDriveLink(link) : null
  const linkInvalid = !!link.trim() && !drive

  function chooseProgramme(value: string) {
    setProgramme(value)
    const p = projects.find(x => x.id === value)
    if (p && !country && (REPORT_COUNTRIES as readonly string[]).includes(p.country)) setCountry(p.country)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!drive) return setError('Paste the link to one Google Drive file or Google Doc (not a folder).')
    if (drive.type !== 'gdoc' && !fileType) return setError('Choose whether the file is a PDF or a Word document.')
    const project = projects.find(p => p.id === programme)

    setBusy(true)
    try {
      const res = await fetch('/api/annual-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, report_type: reportType, country, year: Number(year), period_label: period.trim() || null,
          drive_url: link.trim(), file_type: drive.type ?? fileType,
          project_id: project?.id ?? null,
          programme: project ? project.project_name : PROGRAMME_OTHER,
          programme_other: project ? '' : programmeOther,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Request failed (${res.status})`)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-report-title">
        <div className={styles.modalHead}>
          <h2 id="add-report-title">Add Annual Report</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className={styles.done}>
            <p role="status">The report has been added to the list.</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Done</button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>Google Drive link <span className={styles.req}>*</span></span>
              <input ref={firstField} type="url" value={link} required placeholder="https://drive.google.com/file/d/…"
                     onChange={e => setLink(e.target.value)} aria-invalid={linkInvalid} />
              <span className={styles.hint}>
                {linkInvalid
                  ? 'This is not a link to a single Drive file or Google Doc. Open the file in Drive and use Share → Copy link.'
                  : 'Save the report in the ANNUAL REPORTS folder on the shared drive, then paste its link here (Share → Copy link).'}
              </span>
            </label>

            {drive && drive.type !== 'gdoc' && (
              <label className={styles.field}>
                <span>File type <span className={styles.req}>*</span></span>
                <select value={fileType} onChange={e => setFileType(e.target.value as 'pdf' | 'docx')} required>
                  <option value="" disabled>Select…</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word (.docx)</option>
                </select>
              </label>
            )}

            <label className={styles.field}>
              <span>Report Title <span className={styles.req}>*</span></span>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={300} />
            </label>

            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Report type <span className={styles.req}>*</span></span>
                <select value={reportType} onChange={e => setReportType(e.target.value as 'donor' | 'country')} required>
                  <option value="" disabled>Select…</option>
                  <option value="donor">{REPORT_TYPE_LABEL.donor}</option>
                  <option value="country">{REPORT_TYPE_LABEL.country}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Country <span className={styles.req}>*</span></span>
                <select value={country} onChange={e => setCountry(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {REPORT_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Programme <span className={styles.req}>*</span></span>
              <select value={programme} onChange={e => chooseProgramme(e.target.value)} required>
                <option value="" disabled>Select…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                <option value={PROGRAMME_OTHER}>Other programme (type its name)</option>
              </select>
            </label>
            {programme === PROGRAMME_OTHER && (
              <label className={styles.field}>
                <span>Programme name <span className={styles.hint}>(e.g. Reclaim Sustainability!, ODFBP, ECA annual report)</span></span>
                <input type="text" value={programmeOther} onChange={e => setProgrammeOther(e.target.value)} maxLength={200} />
              </label>
            )}

            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Reporting year <span className={styles.req}>*</span></span>
                <input type="number" value={year} min={MIN_REPORT_YEAR} max={thisYear + 1} required
                       onChange={e => setYear(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Period <span className={styles.hint}>(optional, e.g. Jan–Jun 2024)</span></span>
                <input type="text" value={period} onChange={e => setPeriod(e.target.value)} maxLength={60} />
              </label>
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Saving…' : 'Add Report'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
