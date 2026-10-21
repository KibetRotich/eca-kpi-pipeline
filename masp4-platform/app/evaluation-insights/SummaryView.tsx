/** Renders an AI-generated evaluation summary (used by the review queue and the study page). */
import type { EvaluationSummary } from '@/lib/evaluations'
import styles from './evaluation.module.css'

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <section>
      <h3>{title}</h3>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </section>
  )
}

export default function SummaryView({ summary }: { summary: EvaluationSummary }) {
  return (
    <div className={styles.summary}>
      <p className={styles.aiNote}>
        AI-generated summary, reviewed by the M&amp;E team. Check important figures against the full report before using them.
      </p>
      <p className={styles.headline}>{summary.headline}</p>
      <section>
        <h3>Overview</h3>
        <p>{summary.overview}</p>
      </section>
      <List title="Key findings" items={summary.key_findings} />
      <List title="Recommendations" items={summary.recommendations} />
      <List title="Lessons learned" items={summary.lessons_learned} />
      <section>
        <h3>Methodology</h3>
        <p>{summary.methodology}</p>
      </section>
      <List title="Limitations" items={summary.limitations} />
    </div>
  )
}
