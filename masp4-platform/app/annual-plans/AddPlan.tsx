'use client'

/**
 * "Add Plan" / "Add Budget" button + modal for /annual-plans (Sprint 69).
 * Shown only to signed-in Solidaridad staff (the API enforces the same rule).
 * Staff paste the Drive link of a plan or budget and its details; nothing is copied or read.
 */
import { useEffect, useRef, useState } from 'react'
import { useRole } from '@/lib/role-context'
import {
  DOC_KIND_LABEL, FILE_TYPE_LABEL, MIN_PLAN_YEAR, SCOPE_LABEL, UPLOAD_FILE_TYPES, parsePlanLink,
  type PlanDocKind, type PlanSubTab,
} from '@/lib/annual-plans'
import { PROGRAMME_OTHER, REPORT_COUNTRIES as PLAN_COUNTRIES, isStaffEmail } from '@/lib/annual-reports'
import styles from './plans.module.css'

type Project = { id: string; project_code: string; project_name: string; country: string }

export default function AddPlan({ tab }: { tab: PlanSubTab }) {
  const { email, loading } = useRole()
  const [open, setOpen] = useState(false)
  if (loading || !isStaffEmail(email)) return null
  const label = tab === 'budgets' ? 'Add Budget' : 'Add Plan'

  return (
    <>
      <button type="button" className={styles.addBtn} onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> {label}
      </button>
      {open && <AddPlanModal tab={tab} title={label} onClose={() => setOpen(false)} />}
    </>
  )
}

function AddPlanModal({ tab, title: heading, onClose }: { tab: PlanSubTab; title: string; onClose: () => void }) {
  const thisYear = new Date().getFullYear()
  const [projects, setProjects] = useState<Project[]>([])
  const [link, setLink] = useState('')
  const [fileType, setFileType] = useState('')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState<'project' | 'regional'>('project')
  const [docKind, setDocKind] = useState<PlanDocKind | ''>(tab === 'budgets' ? 'budget' : 'plan')
  const [status, setStatus] = useState<'final' | 'draft'>('final')
  const [programme, setProgramme] = useState('')
  const [programmeOther, setProgrammeOther] = useState('')
  const [country, setCountry] = useState('')
  const [year, setYear] = useState(String(thisYear + 1))
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

  const drive = link.trim() ? parsePlanLink(link) : null
  const linkInvalid = !!link.trim() && !drive

  function chooseScope(value: 'project' | 'regional') {
    setScope(value)
    if (value === 'regional') { setProgramme(PROGRAMME_OTHER); setProgrammeOther('REC ECA Annual Plan'); setCountry('Regional (ECA)') }
    else { setProgramme(''); setProgrammeOther('') }
  }

  function chooseProgramme(value: string) {
    setProgramme(value)
    const p = projects.find(x => x.id === value)
    if (p && !country && (PLAN_COUNTRIES as readonly string[]).includes(p.country)) setCountry(p.country)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!drive) return setError('Paste the link to one Google Drive file, Doc, Sheet or Slides (not a folder).')
    if (!drive.type && !fileType) return setError('Choose the file type.')
    const project = projects.find(p => p.id === programme)

    setBusy(true)
    try {
      const res = await fetch('/api/annual-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, scope, doc_kind: docKind, status, country, plan_year: Number(year), period_label: period.trim() || null,
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
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-plan-title">
        <div className={styles.modalHead}>
          <h2 id="add-plan-title">{heading}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className={styles.done}>
            <p role="status">The file has been added to the list.</p>
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
                  ? 'This is not a link to a single Drive file, Doc, Sheet or Slides. Open the file and use Share → Copy link.'
                  : 'Save the file in the ANNUAL PLANS folder on the shared drive (year → project), then paste its link here (Share → Copy link).'}
              </span>
            </label>

            {drive && !drive.type && (
              <label className={styles.field}>
                <span>File type <span className={styles.req}>*</span></span>
                <select value={fileType} onChange={e => setFileType(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {UPLOAD_FILE_TYPES.map(t => <option key={t} value={t}>{FILE_TYPE_LABEL[t]}</option>)}
                </select>
              </label>
            )}

            <label className={styles.field}>
              <span>Title <span className={styles.req}>*</span></span>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={300} />
            </label>

            <div className={styles.row3}>
              <label className={styles.field}>
                <span>Plan level <span className={styles.req}>*</span></span>
                <select value={scope} onChange={e => chooseScope(e.target.value as 'project' | 'regional')} required>
                  <option value="project">{SCOPE_LABEL.project}</option>
                  <option value="regional">{SCOPE_LABEL.regional}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>The file contains <span className={styles.req}>*</span></span>
                <select value={docKind} onChange={e => setDocKind(e.target.value as PlanDocKind)} required>
                  {(['plan', 'budget', 'plan_budget', 'supporting'] as PlanDocKind[]).map(k => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Status <span className={styles.req}>*</span></span>
                <select value={status} onChange={e => setStatus(e.target.value as 'final' | 'draft')} required>
                  <option value="final">Final</option>
                  <option value="draft">Draft (no final yet)</option>
                </select>
              </label>
            </div>
            {docKind === 'plan_budget' && <p className={styles.hint}>A combined file is listed under both Plans and Budgets.</p>}

            <label className={styles.field}>
              <span>Programme <span className={styles.req}>*</span></span>
              <select value={programme} onChange={e => chooseProgramme(e.target.value)} required>
                <option value="" disabled>Select…</option>
                {scope === 'project' && projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                <option value={PROGRAMME_OTHER}>{scope === 'regional' ? 'Regional plan (type its name)' : 'Other programme (type its name)'}</option>
              </select>
            </label>
            {programme === PROGRAMME_OTHER && (
              <label className={styles.field}>
                <span>Programme name <span className={styles.hint}>(use the same name as earlier years so coverage lines up, e.g. RS! (Reclaim Sustainability), REC ECA Annual Plan)</span></span>
                <input type="text" value={programmeOther} onChange={e => setProgrammeOther(e.target.value)} maxLength={200} />
              </label>
            )}

            <div className={styles.row3}>
              <label className={styles.field}>
                <span>Country <span className={styles.req}>*</span></span>
                <select value={country} onChange={e => setCountry(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {PLAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Plan year <span className={styles.req}>*</span></span>
                <input type="number" value={year} min={MIN_PLAN_YEAR} max={thisYear + 2} required onChange={e => setYear(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Period <span className={styles.hint}>(optional)</span></span>
                <input type="text" value={period} onChange={e => setPeriod(e.target.value)} maxLength={60} placeholder="e.g. 2026 + Q1 2027" />
              </label>
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Saving…' : heading}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
