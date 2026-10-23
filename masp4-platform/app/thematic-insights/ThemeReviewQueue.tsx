'use client'

/**
 * Review queue for /thematic-insights — M&E Officers and Admins only.
 * Lists draft theme syntheses; the reviewer reads each one (with its cited studies), then Publishes or Rejects it.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRole } from '@/lib/role-context'
import type { SourceStudy, ThemeInsight } from '@/lib/themes'
import ThemeView from './ThemeView'
import Meter from './Meter'
import ev from '../evaluation-insights/evaluation.module.css'

type Draft = ThemeInsight & { evaluation_themes: { title: string } | null }

export default function ThemeReviewQueue() {
  const { canEdit, loading } = useRole()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [studies, setStudies] = useState<Record<string, SourceStudy>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/themes?scope=review')
    if (!res.ok) return
    const body = await res.json()
    setDrafts(body.drafts)
    setStudies(body.studies)
  }, [])

  useEffect(() => { if (!loading && canEdit) load() }, [loading, canEdit, load])

  async function act(id: string, action: 'publish' | 'reject') {
    if (action === 'reject' && !confirm('Reject this synthesis? It will not appear on the page.')) return
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/themes/${id}/review`, {
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

  if (loading || !canEdit || !drafts?.length) return null

  return (
    <section className={ev.review} aria-label="Theme syntheses awaiting review">
      <h2>Theme syntheses awaiting review ({drafts.length})</h2>
      {error && <div className={ev.error} role="alert">{error}</div>}
      {drafts.map(d => (
        <div key={d.id} className={ev.reviewItem}>
          <div className={ev.reviewTop}>
            <div>
              <div className={ev.reviewTitle}>
                {d.evaluation_themes?.title ?? d.theme_key}
                <span className={`${ev.badge} ${ev.b_draft}`}>Awaiting review</span>
              </div>
              <div className={ev.meta}>
                <Meter rating={d.evidence_rating} /> · {d.source_report_ids.length} source studies · generated{' '}
                {new Date(d.generated_at).toLocaleDateString('en-GB')}
              </div>
              {d.review_note && <div className={ev.reviewNote}><strong>Check before publishing:</strong> {d.review_note}</div>}
            </div>
            <div className={ev.reviewBtns}>
              <button type="button" className={ev.toggle} onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                {openId === d.id ? 'Hide synthesis' : 'Read synthesis'}
              </button>
              <button type="button" className={`${ev.small} ${ev.publish}`} disabled={busyId === d.id}
                      onClick={() => act(d.id, 'publish')}>Publish</button>
              <button type="button" className={`${ev.small} ${ev.reject}`} disabled={busyId === d.id}
                      onClick={() => act(d.id, 'reject')}>Reject</button>
            </div>
          </div>
          {openId === d.id && <ThemeView synthesis={d.synthesis} studies={studies} filterable={false} />}
        </div>
      ))}
    </section>
  )
}
