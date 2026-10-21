/**
 * /evaluation-insights — Evaluation Insights hub (Sprint 47).
 *
 * Brings together the studies carried out by projects (baselines, midlines, endlines, thematic and
 * impact studies) with the key insights pulled out of each. Every published report is one tile,
 * using the same tile grid as /output-insights, linking to /evaluation-insights/<id>.
 *
 * Signed-in staff see an "Upload Report" button (UploadReport); uploads are summarised by the Claude
 * API into drafts, which M&E Officers / Admins review in the queue (ReviewQueue) before they appear here.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
import tiles from '../output-insights/page.module.css'
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

const MAX_VISIBLE_CHIPS = 3

function StudyTile({ s }: { s: Study }) {
  const chips = [s.country, formatPeriod(s.period_start, s.period_end), ...s.tags].filter(Boolean)
  const visible = chips.slice(0, MAX_VISIBLE_CHIPS)
  const hidden = chips.slice(MAX_VISIBLE_CHIPS)
  const blurb = s.summary?.headline ?? ''
  return (
    <a href={`/evaluation-insights/${s.id}`} className={tiles.tile}>
      <h2 className={tiles.title}>{s.title}</h2>
      <p className={tiles.summary} title={blurb}>{blurb}</p>
      <div className={tiles.tags}>
        {visible.map((c) => (
          <span key={c} className={tiles.tag}>{c}</span>
        ))}
        {hidden.length > 0 && (
          <span className={tiles.more} aria-hidden="true" title={hidden.join(', ')}>
            +{hidden.length} more
          </span>
        )}
      </div>
      <span className={tiles.srOnly}>{s.programme}. Topics: {chips.join(', ')}.</span>
      <span className={tiles.cta}>
        Read insights <span aria-hidden="true">→</span>
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
        <div className={tiles.grid}>
          {studies.map((s) => (
            <StudyTile key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
