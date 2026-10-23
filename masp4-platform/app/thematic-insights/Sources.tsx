/** Citation chips: one link per source study (short programme name · stage · year). */
import { studyStage, type SourceStudy } from '@/lib/themes'
import styles from './themes.module.css'

export default function Sources({ ids, studies }: { ids: string[]; studies: Record<string, SourceStudy> }) {
  const known = [...new Set(ids)].filter(id => studies[id])
  if (!known.length) return null
  return (
    <span className={styles.sources}>
      {known.map(id => {
        const s = studies[id]
        const year = s.period_end?.slice(0, 4)
        return (
          <a key={id} href={`/evaluation-insights/${id}`} className={styles.source} title={s.title}>
            {[s.programme.replace(/^.*\(([^)]+)\)\s*$/, '$1'), studyStage(s.tags), year].filter(Boolean).join(' · ')}
          </a>
        )
      })}
    </span>
  )
}
