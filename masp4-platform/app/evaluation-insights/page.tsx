/**
 * /evaluation-insights — Evaluation Insights hub (placeholder).
 *
 * Will bring together the studies carried out by projects (baselines, midlines,
 * endlines, thematic and impact studies) and pull out their key insights. Each
 * study is one tile, using the same tile grid as /output-insights.
 *
 * To add a study: append an entry to STUDIES below. Until then the page shows
 * an empty state.
 */
import styles from '../output-insights/page.module.css'

export const metadata = {
  title: 'Evaluation Insights — MASP IV Data Platform',
}

type Study = {
  href: string
  external?: boolean
  title: string       // study name
  blurb: string       // key insights in one or two sentences
  chips: string[]     // e.g. project, country, study type, year
}

const STUDIES: Study[] = []

const MAX_VISIBLE_CHIPS = 3

function StudyTile({ s }: { s: Study }) {
  const visible = s.chips.slice(0, MAX_VISIBLE_CHIPS)
  const hidden = s.chips.slice(MAX_VISIBLE_CHIPS)
  return (
    <a
      href={s.href}
      className={styles.tile}
      {...(s.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <h2 className={styles.title}>{s.title}</h2>
      <p className={styles.summary} title={s.blurb}>{s.blurb}</p>
      <div className={styles.tags}>
        {visible.map((c) => (
          <span key={c} className={styles.tag}>{c}</span>
        ))}
        {hidden.length > 0 && (
          <span className={styles.more} aria-hidden="true" title={hidden.join(', ')}>
            +{hidden.length} more
          </span>
        )}
      </div>
      <span className={styles.srOnly}>Topics: {s.chips.join(', ')}.</span>
      <span className={styles.cta}>
        Open study <span aria-hidden="true">{s.external ? '↗' : '→'}</span>
      </span>
    </a>
  )
}

export default function EvaluationInsightsPage() {
  return (
    <div>
      <header style={{ marginBottom: '.9rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Evaluation Insights</h1>
        <p style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: '#555', maxWidth: 760 }}>
          Key insights from the studies carried out by projects: baselines, midlines, endlines, and thematic
          and impact studies. Studies will be added here as they are completed.
        </p>
      </header>

      {STUDIES.length === 0 ? (
        <div style={{
          border: '1px dashed #d0d0d0',
          borderRadius: 6,
          background: '#fff',
          padding: '1.4rem 1.2rem',
          maxWidth: 760,
          fontSize: '.78rem',
          color: '#555',
        }}>
          <strong style={{ display: 'block', color: '#111', fontSize: '.85rem', marginBottom: '.3rem' }}>
            Coming soon
          </strong>
          No studies have been added yet. Each study will appear here as a tile with its project, country,
          study type and year, a short summary of its key insights, and a link to the full study.
        </div>
      ) : (
        <div className={styles.grid}>
          {STUDIES.map((s) => (
            <StudyTile key={s.href} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
