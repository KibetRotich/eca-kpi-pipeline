/**
 * Renders one theme synthesis as a board-level view (used by the theme page and the review queue):
 * headline, headline figures, % change by commodity, commodity scorecard, small trend charts and three
 * takeaways per column. The full prose and citations stay in the stored synthesis but are not shown.
 * A synthesis written before Sprint 51 has no `board` block; it falls back to its headline and top three points.
 */
import {
  BASIS_LABEL, STATUS_LABEL, type BoardView, type ThemeSynthesis,
} from '@/lib/themes'
import styles from './themes.module.css'

const fmt = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 2 })
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmt(v)}%`

function Figures({ figures }: { figures: BoardView['figures'] }) {
  if (!figures.length) return null
  return (
    <div className={styles.figures}>
      {figures.map((f, i) => (
        <div key={i} className={styles.figure}>
          <span className={styles.figValue}>{f.value}</span>
          <span className={styles.figLabel}>{f.label}</span>
          <span className={styles.figContext}>{f.context} · {BASIS_LABEL[f.basis]}</span>
        </div>
      ))}
    </div>
  )
}

/** Horizontal bars from a zero line; self-reported figures are drawn hollow. */
function ChangeChart({ rows }: { rows: BoardView['change'] }) {
  if (!rows.length) return null
  const lo = Math.min(0, ...rows.map(r => r.pct))
  const hi = Math.max(0, ...rows.map(r => r.pct))
  const span = hi - lo || 1
  const at = (v: number) => ((v - lo) / span) * 100
  return (
    <section>
      <h3>Change by commodity</h3>
      <figure className={styles.chart}>
        <div className={styles.legend}>
          <span><i className={styles.keySolid} /> Measured (comparison group or before → after)</span>
          <span><i className={styles.keyHollow} /> Self-reported</span>
        </div>
        {rows.map((r, i) => {
          const left = Math.min(at(0), at(r.pct)), width = Math.abs(at(r.pct) - at(0))
          return (
            <div key={i} className={styles.changeRow} tabIndex={0}>
              <span className={styles.rowLabel}>
                <b>{r.commodity}</b> · {r.indicator}
                <span className={styles.changeFrom}>{r.from} → {r.to}</span>
              </span>
              <div className={styles.track}>
                <span className={styles.zero} style={{ left: `${at(0)}%` }} />
                <span className={r.basis === 'self_reported' ? styles.barHollow : styles.barSolid}
                      style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }} />
                <span className={styles.tip}>
                  <strong>{r.commodity}: {signed(r.pct)}</strong><br />
                  {r.from} → {r.to} · {BASIS_LABEL[r.basis]}
                </span>
              </div>
              <span className={styles.changeValue}>{signed(r.pct)}</span>
            </div>
          )
        })}
      </figure>
    </section>
  )
}

function Scorecard({ rows }: { rows: BoardView['scorecard'] }) {
  if (!rows.length) return null
  return (
    <section>
      <h3>By commodity</h3>
      <div className={styles.scorecard}>
        {rows.map(r => (
          <span key={r.commodity} className={`${styles.chip} ${styles[`st_${r.status}`]}`}>
            {r.commodity} <em>{STATUS_LABEL[r.status]}</em>
          </span>
        ))}
      </div>
    </section>
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
    <figure className={styles.spark}>
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

export default function ThemeView({ synthesis }: { synthesis: ThemeSynthesis }) {
  const b = synthesis.board
  return (
    <div className={styles.synthesis}>
      <p className={styles.headline}>{synthesis.headline}</p>
      {b ? (
        <>
          <Figures figures={b.figures} />
          <div className={styles.boardCharts}>
            <ChangeChart rows={b.change} />
            <Scorecard rows={b.scorecard} />
          </div>
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
