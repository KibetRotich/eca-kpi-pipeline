'use client'

/**
 * "Upload Report" button + modal for /evaluation-insights.
 * Shown only to signed-in Solidaridad staff (the API enforces the same rule).
 *
 * Flow: POST /api/evaluations (metadata → signed upload URL) → upload the file straight to the
 * private `reports` bucket → POST /api/evaluations/<id>/process (starts the summarisation pipeline).
 */
import { useEffect, useRef, useState } from 'react'
import { useRole } from '@/lib/role-context'
import { supabaseBrowser } from '@/lib/supabase-browser'
import {
  EVAL_COUNTRIES, EVAL_TAGS, MAX_REPORT_BYTES, PROGRAMME_OTHER, REPORT_TYPES, isStaffEmail,
} from '@/lib/evaluations'
import styles from './evaluation.module.css'

type Project = { id: string; project_code: string; project_name: string; country: string }

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function errorText(res: Response) {
  try { return (await res.json()).error ?? `Request failed (${res.status})` } catch { return `Request failed (${res.status})` }
}

export default function UploadReport() {
  const { email, loading } = useRole()
  const [open, setOpen] = useState(false)
  if (loading || !isStaffEmail(email)) return null

  return (
    <>
      <button type="button" className={styles.uploadBtn} onClick={() => setOpen(true)}>
        <span aria-hidden="true">⬆</span> Upload Report
      </button>
      {open && <UploadModal onClose={() => setOpen(false)} />}
    </>
  )
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [programme, setProgramme] = useState('')      // project id, or PROGRAMME_OTHER
  const [country, setCountry] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [tags, setTags] = useState<string[]>([])
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

  function pickFile(f: File | null) {
    setError(null)
    if (!f) return setFile(null)
    const ext = f.name.toLowerCase().split('.').pop()
    if (!REPORT_TYPES[f.type] && ext !== 'pdf' && ext !== 'docx') {
      setFile(null)
      return setError('Only .pdf and .docx files can be uploaded.')
    }
    if (f.size > MAX_REPORT_BYTES) {
      setFile(null)
      return setError('The file must be smaller than 25 MB.')
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim())
  }

  function chooseProgramme(value: string) {
    setProgramme(value)
    const p = projects.find(x => x.id === value)
    if (p && !country && (EVAL_COUNTRIES as readonly string[]).includes(p.country)) setCountry(p.country)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) return setError('Choose a .pdf or .docx file.')
    if (start && end && start > end) return setError('The evaluation period ends before it starts.')

    const mime = REPORT_TYPES[file.type] ? file.type
      : file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const project = projects.find(p => p.id === programme)

    try {
      setBusy('Preparing upload…')
      const created = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, country, tags,
          project_id: project?.id ?? null,
          programme: project ? project.project_name : PROGRAMME_OTHER,
          period_start: start || null, period_end: end || null,
          file_name: file.name, file_type: mime, file_size: file.size,
        }),
      })
      if (!created.ok) throw new Error(await errorText(created))
      const { id, path, token } = await created.json()

      setBusy('Uploading file…')
      const up = await supabaseBrowser.storage.from('reports').uploadToSignedUrl(path, token, file, { contentType: mime })
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`)

      setBusy('Starting summary…')
      const processed = await fetch(`/api/evaluations/${id}/process`, { method: 'POST' })
      if (!processed.ok) throw new Error(await errorText(processed))

      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="upload-report-title">
        <div className={styles.modalHead}>
          <h2 id="upload-report-title">Upload Report</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={!!busy} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className={styles.done}>
            <p role="status">
              Your report has been received and will appear on this page within a few minutes, once an
              M&amp;E officer has reviewed its summary.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Done</button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>Report file <span className={styles.req}>*</span></span>
              <input ref={firstField} type="file" accept={ACCEPT} required
                     onChange={e => pickFile(e.target.files?.[0] ?? null)} />
              <span className={styles.hint}>PDF or Word (.docx), up to 25 MB.</span>
            </label>

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
              <button type="submit" className={styles.primary} disabled={!!busy}>{busy ?? 'Upload & Process'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
