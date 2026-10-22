/**
 * /evaluation-insights — Evaluation Insights hub (Sprint 47).
 *
 * Brings together the studies carried out by projects (baselines, midlines, endlines, thematic and
 * impact studies) with the key insights pulled out of each. Every published report is one compact tile
 * (sized like the Projects' Progress project tiles) linking to /evaluation-insights/<id>.
 *
 * Signed-in staff see an "Upload Report" button (UploadReport); uploads are summarised by the Claude
 * API into drafts, which M&E Officers / Admins review in the queue (ReviewQueue) before they appear here.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
import styles from './evaluation.module.css'
import UploadReport from './UploadReport'
import ReviewQueue from './ReviewQueue'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Evaluation Insights — MASP IV Data Platform',
}

type Study = {
  id: string
  title: string
  programme: string
  country: string
  period_start: string | null
  period_end: string | null
  tags: string[]
  summary: EvaluationSummary | null
}

function StudyTile({ s }: { s: Study }) {
  const kicker = [s.country, s.tags[0]].filter(Boolean).join(' · ')
  const blurb = s.summary?.headline ?? ''
  return (
    <a href={`/evaluation-insights/${s.id}`} className={styles.studyTile}
       title={[s.programme, s.tags.join(', ')].filter(Boolean).join(' — ')}>
      <span className={styles.studyKicker}>{kicker}</span>
      <h2 className={styles.studyTitle}>{s.title}</h2>
      {blurb && <p className={styles.studyHeadline}>{blurb}</p>}
      <span className={styles.studyFoot}>
        <span>{formatPeriod(s.period_start, s.period_end)}</span>
        <span>Read insights <span aria-hidden="true">→</span></span>
      </span>
    </a>
  )
}

export default async function EvaluationInsightsPage() {
  const { data } = await supabaseAdmin
    .from('evaluation_reports')
    .select('id, title, programme, country, period_start, period_end, tags, summary')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  const studies = (data ?? []) as Study[]

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Evaluation Insights</h1>
          <p className={styles.intro}>
            Key insights from the studies carried out by projects: baselines, midlines, endlines, and thematic
            and impact studies. Studies will be added here as they are completed.
          </p>
        </div>
        <UploadReport />
      </header>

      <ReviewQueue />

      {studies.length === 0 ? (
        <div className={styles.empty}>
          <strong>Coming soon</strong>
          No studies have been published yet. Each study will appear here as a tile with its project, country,
          study type and period, a short summary of its key insights, and a link to the full study.
        </div>
      ) : (
        <div className={styles.studyGrid}>
          {studies.map((s) => (
            <StudyTile key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
