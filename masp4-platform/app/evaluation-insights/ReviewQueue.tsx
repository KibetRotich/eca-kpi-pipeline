'use client'

/**
 * Review queue for /evaluation-insights — M&E Officers and Admins only.
 * Lists reports that are not yet public (awaiting summary, in progress, drafts awaiting review, failures) and lets the
 * reviewer read the AI summary, then Publish, Reject or Retry it. Refreshes every 20 s while any
 * report is being summarised.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRole } from '@/lib/role-context'
import { formatPeriod, type EvaluationReport } from '@/lib/evaluations'
import SummaryView from './SummaryView'
import styles from './evaluation.module.css'

const LABEL: Record<string, string> = {
  uploading: 'Uploading', queued: 'Awaiting summary', processing: 'Summarising', draft: 'Awaiting review', failed: 'Failed',
}

export default function ReviewQueue() {
  const { canEdit, loading } = useRole()
  const [items, setItems] = useState<EvaluationReport[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/evaluations?scope=review')
    if (res.ok) setItems(await res.json())
  }, [])

  useEffect(() => { if (!loading && canEdit) load() }, [loading, canEdit, load])

  const pending = items?.some(i => i.status === 'processing')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [pending, load])

  async function act(id: string, action: 'publish' | 'reject' | 'retry') {
    if (action === 'reject' && !confirm('Reject this report? It will not appear on the page.')) return
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/evaluations/${id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    setBusyId(null)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'The action failed')
      return
    }
    if (action === 'publish') window.location.reload()
    else load()
  }

  if (loading || !canEdit || !items?.length) return null

  return (
    <section className={styles.review} aria-label="Reports awaiting review">
      <h2>Awaiting review ({items.length})</h2>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {items.map(r => (
        <div key={r.id} className={styles.reviewItem}>
          <div className={styles.reviewTop}>
            <div>
              <div className={styles.reviewTitle}>
                {r.title}
                <span className={`${styles.badge} ${styles['b_' + r.status]}`}>{LABEL[r.status] ?? r.status}</span>
              </div>
              <div className={styles.meta}>
                {[r.programme, r.country, formatPeriod(r.period_start, r.period_end)].filter(Boolean).join(' · ')}
                {r.evaluator ? ` · evaluated by ${r.evaluator}` : ''}
                {' · '}{r.uploaded_by.includes('@') ? `uploaded by ${r.uploaded_by}` : r.uploaded_by}
                {' on '}{new Date(r.uploaded_at).toLocaleDateString('en-GB')}
                {' · '}<a href={r.source_url ?? `/api/evaluations/${r.id}/file`} target="_blank" rel="noopener noreferrer">
                  {r.file_name}{r.source_url ? ' (Google Drive)' : ''}
                </a>
              </div>
              {r.review_note && <div className={styles.reviewNote}><strong>Check before publishing:</strong> {r.review_note}</div>}
              {r.status === 'failed' && r.error && <div className={styles.meta} style={{ color: 'var(--red)' }}>{r.error}</div>}
            </div>
            <div className={styles.reviewBtns}>
              {r.status === 'draft' && (
                <>
                  <button type="button" className={styles.toggle} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    {openId === r.id ? 'Hide summary' : 'Read summary'}
                  </button>
                  <button type="button" className={`${styles.small} ${styles.publish}`} disabled={busyId === r.id}
                          onClick={() => act(r.id, 'publish')}>Publish</button>
                </>
              )}
              {['draft', 'failed', 'uploading', 'queued'].includes(r.status) && (
                <>
                  <button type="button" className={`${styles.small} ${styles.retry}`} disabled={busyId === r.id}
                          onClick={() => act(r.id, 'retry')}>Retry</button>
                  <button type="button" className={`${styles.small} ${styles.reject}`} disabled={busyId === r.id}
                          onClick={() => act(r.id, 'reject')}>Reject</button>
                </>
              )}
            </div>
          </div>
          {openId === r.id && r.summary && <SummaryView summary={r.summary} />}
        </div>
      ))}
    </section>
  )
}
