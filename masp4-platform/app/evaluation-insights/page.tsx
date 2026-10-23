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
import styles from './evaluation.module.css'
import UploadReport from './UploadReport'
import ReviewQueue from './ReviewQueue'
import StudyBrowser, { type Study } from './StudyBrowser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Evaluation Insights — MASP IV Data Platform',
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
        <StudyBrowser studies={studies} />
      )}
    </div>
  )
}
