/**
 * /evaluation-insights/<id> — one published study: its key insights and a staff-only link to the
 * full report. Unpublished reports are not shown here (reviewers read drafts in the review queue).
 */
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
import SummaryView from '../SummaryView'
import styles from '../evaluation.module.css'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getStudy(id: string) {
  if (!UUID.test(id)) return null
  const { data } = await supabaseAdmin.from('evaluation_reports')
    .select('id, title, programme, country, period_start, period_end, tags, file_type, summary, published_at')
    .eq('id', id).eq('status', 'published').single()
  return data as (null | {
    id: string; title: string; programme: string; country: string; period_start: string | null
    period_end: string | null; tags: string[]; file_type: string; summary: EvaluationSummary | null; published_at: string
  })
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const study = await getStudy((await params).id)
  return { title: `${study?.title ?? 'Study'} — Evaluation Insights` }
}

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const study = await getStudy((await params).id)
  if (!study) notFound()

  const period = formatPeriod(study.period_start, study.period_end)
  return (
    <div>
      <a href="/evaluation-insights" className={styles.back}>← All studies</a>
      <article className={styles.detail}>
        <div className={styles.detailHead}>
          <div>
            <h1>{study.title}</h1>
            <div className={styles.meta}>
              {[study.programme, study.country, period].filter(Boolean).join(' · ')}
            </div>
            {study.tags.length > 0 && (
              <div className={styles.chips}>
                {study.tags.map(t => <span key={t} className={styles.chip}>{t}</span>)}
              </div>
            )}
          </div>
          <a href={`/api/evaluations/${study.id}/file`} className={styles.download}
             title="Signed-in Solidaridad staff only">
            Full report ({study.file_type.toUpperCase()}) <span aria-hidden="true">↓</span>
          </a>
        </div>
        {study.summary && <SummaryView summary={study.summary} />}
      </article>
    </div>
  )
}
