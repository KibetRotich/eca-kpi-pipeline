'use client'

/**
 * "Add Study" button + modal for /evaluation-insights (Sprint 60 — replaced "Upload Report").
 * Shown only to signed-in Solidaridad staff (the API enforces the same rule).
 *
 * Studies stay in Google Drive: staff paste the Drive link and the study's details, and
 * POST /api/evaluations saves it as 'queued' (Awaiting summary). Nothing is copied to Supabase Storage.
 */
import { useEffect, useRef, useState } from 'react'
import { useRole } from '@/lib/role-context'
import {
  EVAL_COMMODITIES, EVAL_COUNTRIES, EVAL_TAGS, PROGRAMME_OTHER, isStaffEmail, parseDriveLink,
} from '@/lib/evaluations'
import styles from './evaluation.module.css'

type Project = { id: string; project_code: string; project_name: string; country: string }

async function errorText(res: Response) {
  try { return (await res.json()).error ?? `Request failed (${res.status})` } catch { return `Request failed (${res.status})` }
}

export default function AddStudy() {
  const { email, loading } = useRole()
  const [open, setOpen] = useState(false)
  if (loading || !isStaffEmail(email)) return null

  return (
    <>
      <button type="button" className={styles.uploadBtn} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> Add Study
      </button>
      {open && <AddStudyModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AddStudyModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [link, setLink] = useState('')
  const [fileType, setFileType] = useState<'' | 'pdf' | 'docx'>('')
  const [title, setTitle] = useState('')
  const [programme, setProgramme] = useState('')      // project id, or PROGRAMME_OTHER
  const [country, setCountry] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [commodities, setCommodities] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
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
    if (p && !country && (EVAL_COUNTRIES as readonly string[]).includes(p.country)) setCountry(p.country)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!drive) return setError('Paste the link to one Google Drive file or Google Doc (not a folder).')
    if (drive.type !== 'gdoc' && !fileType) return setError('Choose whether the file is a PDF or a Word document.')
    if (start && end && start > end) return setError('The evaluation period ends before it starts.')
    const project = projects.find(p => p.id === programme)

    try {
      setBusy('Saving…')
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, country, tags, commodities,
          drive_url: link.trim(), file_type: drive.type ?? fileType,
          project_id: project?.id ?? null,
          programme: project ? project.project_name : PROGRAMME_OTHER,
          period_start: start || null, period_end: end || null,
        }),
      })
      if (!res.ok) throw new Error(await errorText(res))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-study-title">
        <div className={styles.modalHead}>
          <h2 id="add-study-title">Add Study</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={!!busy} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className={styles.done}>
            <p role="status">
              The study has been added. Its key insights will be summarised, and it will appear on this page once
              an M&amp;E officer has reviewed them.
            </p>
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
                  : 'Save the report in the studies folder on the shared drive, then paste its link here (Share → Copy link). The file stays in Drive.'}
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
                <span>Programme <span className={styles.req}>*</span></span>
                <select value={programme} onChange={e => chooseProgramme(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                  <option value={PROGRAMME_OTHER}>{PROGRAMME_OTHER}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Country <span className={styles.req}>*</span></span>
                <select value={country} onChange={e => setCountry(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {EVAL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <fieldset className={styles.fieldset}>
              <legend>Evaluation Period</legend>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span className={styles.hint}>From</span>
                  <input type="date" value={start} max={end || undefined} onChange={e => setStart(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.hint}>To</span>
                  <input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} />
                </label>
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Commodities <span className={styles.hint}>(leave empty for a programme-wide study)</span></legend>
              <div className={styles.tagGrid}>
                {EVAL_COMMODITIES.map(c => {
                  const on = commodities.includes(c)
                  return (
                    <label key={c} className={`${styles.tagOption} ${on ? styles.tagOn : ''}`}>
                      <input type="checkbox" checked={on}
                             onChange={() => setCommodities(on ? commodities.filter(x => x !== c) : [...commodities, c])} />
                      {c}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Tags</legend>
              <div className={styles.tagGrid}>
                {EVAL_TAGS.map(t => {
                  const on = tags.includes(t)
                  return (
                    <label key={t} className={`${styles.tagOption} ${on ? styles.tagOn : ''}`}>
                      <input type="checkbox" checked={on}
                             onChange={() => setTags(on ? tags.filter(x => x !== t) : [...tags, t])} />
                      {t}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onClose} disabled={!!busy}>Cancel</button>
              <button type="submit" className={styles.primary} disabled={!!busy}>{busy ?? 'Add Study'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
