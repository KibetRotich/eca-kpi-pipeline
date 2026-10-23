/** Evaluation Insights hub body: one compact tile per published study, linking to /evaluation-insights/<id>. */
import { formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
import { studyStage } from '@/lib/themes'
import styles from './evaluation.module.css'

export type Study = {
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
  const kicker = [s.country, studyStage(s.tags)].filter(Boolean).join(' · ')
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

export default function StudyBrowser({ studies }: { studies: Study[] }) {
  return (
    <div className={styles.studyGrid}>
      {studies.map(s => <StudyTile key={s.id} s={s} />)}
    </div>
  )
}
