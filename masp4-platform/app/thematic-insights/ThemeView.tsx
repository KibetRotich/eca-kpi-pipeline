/**
 * Renders one theme synthesis as a board-level view (used by the theme page and the review queue):
 * headline, headline figures, small trend charts and three takeaways per column. The full prose and citations stay in the stored synthesis but are not shown.
 * `by` is 'commodity' on a theme page and 'theme' on a commodity page.
 * The "Change by …" chart and "By …" scorecard were removed from both page types on 2026-11-03 to keep them simple;
 * board.change and board.scorecard are still stored in each synthesis.
 * Every chart and figure block can be copied or downloaded as an image (CopyChart, Sprint 59).
 * Commodity pages (Sprint 58) also show the synthesis's `charts` ("In figures"), each citing its studies.
 * A synthesis written before Sprint 51 has no `board` block; it falls back to its headline and top three points.
 */
import {
  BASIS_LABEL, type BoardView, type SourceStudy, type ThemeSynthesis,
} from '@/lib/themes'
import ThemeCharts from './ThemeCharts'
import CopyChart from './CopyChart'
import styles from './themes.module.css'

type By = 'commodity' | 'theme'

const fmt = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 2 })

function Figures({ figures }: { figures: BoardView['figures'] }) {
  if (!figures.length) return null
  return (
    <div className={`${styles.figures} ${styles.copyable}`} data-copy="">
      <CopyChart title="Headline figures" />
      {figures.map((f, i) => (
        <div key={i} className={styles.figure}>
          <span className={styles.figValue}>{f.value}</span>
          <span className={styles.figLabel}>{f.label}</span>
          {f.explain && <span className={styles.figExplain}>{f.explain}</span>}
          <span className={styles.figContext}>{f.context} · {BASIS_LABEL[f.basis]}</span>
        </div>
      ))}
    </div>
  )
}

/** One small line chart per project: one indicator, one unit. */
function Spark({ s }: { s: BoardView['series'][number] }) {
  const W = 260, H = 110, P = { l: 12, r: 12, t: 22, b: 26 }
  const vals = s.points.map(p => p.value)
  const min = Math.min(0, ...vals), max = Math.max(...vals) || 1
  const x = (i: number) => P.l + (s.points.length === 1 ? 0 : (i / (s.points.length - 1)) * (W - P.l - P.r))
  const y = (v: number) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b)
  const anchor = (i: number) => i === 0 ? 'start' : i === s.points.length - 1 ? 'end' : 'middle'
  return (
    <figure className={`${styles.spark} ${styles.copyable}`} data-copy="">
      <CopyChart title={`${s.project} - ${s.indicator}`} />
      <figcaption><b>{s.project}</b><span>{s.indicator} ({s.unit})</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`${s.project}: ${s.points.map(p => `${p.label} ${fmt(p.value)} ${s.unit}`).join(', ')}`}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className={styles.sparkBase} />
        <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')} className={styles.sparkLine} />
        {s.points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4} className={styles.sparkDot} />
            <text x={x(i)} y={y(p.value) - 8} textAnchor={anchor(i)} className={styles.sparkVal}>{fmt(p.value)}</text>
            <text x={x(i)} y={H - 8} textAnchor={anchor(i)} className={styles.sparkLab}>{p.label}</text>
          </g>
        ))}
      </svg>
    </figure>
  )
}

function Takeaways({ works, barriers, actions }: BoardView['takeaways']) {
  const cols: [string, string[]][] = [['What works', works], ['What holds results back', barriers], ['What to do', actions]]
  return (
    <div className={styles.takeaways}>
      {cols.filter(([, items]) => items.length).map(([title, items]) => (
        <section key={title}>
          <h3>{title}</h3>
          <ul>{items.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </section>
      ))}
    </div>
  )
}

export default function ThemeView({ synthesis, by = 'commodity', studies = {} }: {
  synthesis: ThemeSynthesis
  by?: By
  studies?: Record<string, SourceStudy>
}) {
  const b = synthesis.board
  return (
    <div className={styles.synthesis}>
      <p className={styles.headline}>{synthesis.headline}</p>
      {b ? (
        <>
          <Figures figures={b.figures} />
          {by === 'theme' && synthesis.charts && synthesis.charts.length > 0 && (
            <ThemeCharts charts={synthesis.charts} studies={studies} keep={() => true} />
          )}
          {b.series.length > 0 && (
            <section>
              <h3>Change over time</h3>
              <div className={styles.sparks}>{b.series.map((s, i) => <Spark key={i} s={s} />)}</div>
            </section>
          )}
          <Takeaways {...b.takeaways} />
          <p className={styles.confidence}>{b.confidence}</p>
        </>
      ) : (
        <Takeaways works={synthesis.what_works.map(p => p.text)} barriers={synthesis.barriers.map(p => p.text)}
                   actions={synthesis.recommendations.map(p => p.text)} />
      )}
    </div>
  )
}
