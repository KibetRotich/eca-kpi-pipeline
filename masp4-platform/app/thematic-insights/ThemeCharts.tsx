/**
 * Charts for a theme synthesis ("In figures"). Plain HTML/CSS horizontal charts, one unit per chart:
 *   dumbbell (earlier → later per item), bar (one value per item) and stacked (shares per item).
 * Every row shows its value as text and a hover/focus tooltip, every chart has a data table, and
 * each chart lists the studies its rows come from. Rows are narrowed by the theme page's filters (`keep`).
 */
import type { SourceStudy, ThemeChart } from '@/lib/themes'
import Sources from './Sources'
import styles from './themes.module.css'

/** Categorical order for stacked shares (validated palette; fixed order, never cycled). */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

/** A trailing "Other …" category is a remainder, so it gets neutral grey rather than a series hue. */
const OTHER = '#b5b3ad'
const segColor = (cats: string[], j: number) => /^other/i.test(cats[j]) ? OTHER : SERIES[j]

const fmt = (v: number) => v.toLocaleString('en-GB', { maximumFractionDigits: 2 })

/** Rounds an axis maximum up to 1, 2, 2.5 or 5 × a power of ten. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`

function Axis({ max, unit }: { max: number; unit: string }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max)
  return (
    <div className={styles.axisRow} aria-hidden="true">
      <span />
      <div className={styles.axis}>
        {ticks.map((t, i) => <span key={i} style={{ left: pct(t, max) }}>{fmt(t)}</span>)}
      </div>
      <span className={styles.axisUnit}>{unit}</span>
    </div>
  )
}

function Grid({ max, line }: { max: number; line?: { value: number; label: string } }) {
  return (
    <>
      {[0.25, 0.5, 0.75].map(f => <span key={f} className={styles.grid} style={{ left: pct(f * max, max) }} />)}
      {line && <span className={styles.refLine} style={{ left: pct(line.value, max) }} title={`${line.label}: ${fmt(line.value)}`} />}
    </>
  )
}

function Dumbbell({ c }: { c: Extract<ThemeChart, { type: 'dumbbell' }> }) {
  const max = niceMax(Math.max(...c.rows.flatMap(r => [r.before, r.after]), c.target?.value ?? 0))
  return (
    <>
      <div className={styles.legend}>
        <span><i className={styles.dotBefore} /> Earlier measurement</span>
        <span><i className={styles.dotAfter} /> Later measurement</span>
        {c.target && <span><i className={styles.refKey} /> {c.target.label} ({fmt(c.target.value)})</span>}
      </div>
      {c.rows.map((r, i) => {
        const lo = Math.min(r.before, r.after), hi = Math.max(r.before, r.after)
        return (
          <div key={i} className={styles.chartRow} tabIndex={0}>
            <span className={styles.rowLabel}>{r.label}</span>
            <div className={styles.track}>
              <Grid max={max} line={c.target} />
              <span className={styles.connector} style={{ left: pct(lo, max), width: `calc(${pct(hi, max)} - ${pct(lo, max)})` }} />
              <span className={styles.dotBefore} style={{ left: pct(r.before, max) }} />
              <span className={styles.dotAfter} style={{ left: pct(r.after, max) }} />
              <span className={styles.tip}>
                <strong>{r.label}</strong><br />
                {r.beforeLabel}: {fmt(r.before)} → {r.afterLabel}: {fmt(r.after)} {c.unit}
              </span>
            </div>
            <span className={styles.rowValue}>{fmt(r.before)} → <b>{fmt(r.after)}</b></span>
          </div>
        )
      })}
      <Axis max={max} unit={c.unit} />
    </>
  )
}

function Bars({ c }: { c: Extract<ThemeChart, { type: 'bar' }> }) {
  const max = niceMax(Math.max(...c.rows.map(r => r.value), c.reference?.value ?? 0))
  return (
    <>
      {c.reference && (
        <div className={styles.legend}><span><i className={styles.refKey} /> {c.reference.label} ({fmt(c.reference.value)})</span></div>
      )}
      {c.rows.map((r, i) => (
        <div key={i} className={styles.chartRow} tabIndex={0}>
          <span className={styles.rowLabel}>{r.label}</span>
          <div className={styles.track}>
            <Grid max={max} line={c.reference} />
            <span className={styles.bar} style={{ width: pct(r.value, max) }} />
            <span className={styles.tip}><strong>{r.label}</strong><br />{fmt(r.value)} {c.unit}</span>
          </div>
          <span className={styles.rowValue}><b>{fmt(r.value)}</b></span>
        </div>
      ))}
      <Axis max={max} unit={c.unit} />
    </>
  )
}

function Stacked({ c }: { c: Extract<ThemeChart, { type: 'stacked' }> }) {
  return (
    <>
      <div className={styles.legend}>
        {c.categories.map((cat, i) => <span key={cat}><i className={styles.swatch} style={{ background: segColor(c.categories, i) }} /> {cat}</span>)}
      </div>
      {c.rows.map((r, i) => {
        const total = r.values.reduce((a, b) => a + b, 0) || 1
        return (
          <div key={i} className={styles.chartRow}>
            <span className={styles.rowLabel}>{r.label}</span>
            <div className={styles.stack}>
              {r.values.map((v, j) => v > 0 && (
                <span key={j} className={styles.segment} tabIndex={0}
                      style={{ width: `${(v / total) * 100}%`, background: segColor(c.categories, j) }}>
                  {(v / total) * 100 >= 9 && <span className={styles.segLabel}>{fmt(v)}</span>}
                  <span className={styles.tip}><strong>{r.label}</strong><br />{c.categories[j]}: {fmt(v)}{c.unit === '%' ? '%' : ` ${c.unit}`}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

function DataTable({ c }: { c: ThemeChart }) {
  return (
    <details className={styles.tableView}>
      <summary>Data table</summary>
      <table>
        {c.type === 'dumbbell' && (
          <>
            <thead><tr><th>Item</th><th>Earlier</th><th>Later</th></tr></thead>
            <tbody>{c.rows.map((r, i) => (
              <tr key={i}><td>{r.label}</td><td>{fmt(r.before)} ({r.beforeLabel})</td><td>{fmt(r.after)} ({r.afterLabel})</td></tr>
            ))}</tbody>
          </>
        )}
        {c.type === 'bar' && (
          <>
            <thead><tr><th>Item</th><th>{c.unit}</th></tr></thead>
            <tbody>
              {c.rows.map((r, i) => <tr key={i}><td>{r.label}</td><td>{fmt(r.value)}</td></tr>)}
              {c.reference && <tr><td>{c.reference.label}</td><td>{fmt(c.reference.value)}</td></tr>}
            </tbody>
          </>
        )}
        {c.type === 'stacked' && (
          <>
            <thead><tr><th>Item</th>{c.categories.map(cat => <th key={cat}>{cat}</th>)}</tr></thead>
            <tbody>{c.rows.map((r, i) => (
              <tr key={i}><td>{r.label}</td>{r.values.map((v, j) => <td key={j}>{fmt(v)}</td>)}</tr>
            ))}</tbody>
          </>
        )}
      </table>
    </details>
  )
}

export default function ThemeCharts({ charts, studies, keep }: {
  charts: ThemeChart[]
  studies: Record<string, SourceStudy>
  keep: (sourceId: string) => boolean
}) {
  const shown = charts
    .map(c => ({ ...c, rows: (c.rows as { source: string }[]).filter(r => keep(r.source)) }) as ThemeChart)
    .filter(c => c.rows.length > 0)
  if (!shown.length) return null
  return (
    <section>
      <h3>In figures</h3>
      <div className={styles.charts}>
        {shown.map((c, i) => (
          <figure key={i} className={styles.chart}>
            <figcaption>
              <span className={styles.chartTitle}>{c.title}</span>
              <span className={styles.chartUnit}>{c.unit}</span>
            </figcaption>
            {c.type === 'dumbbell' && <Dumbbell c={c} />}
            {c.type === 'bar' && <Bars c={c} />}
            {c.type === 'stacked' && <Stacked c={c} />}
            {c.note && <p className={styles.chartNote}>{c.note}</p>}
            <div className={styles.chartFoot}>
              <Sources ids={(c.rows as { source: string }[]).map(r => r.source)} studies={studies} />
              <DataTable c={c} />
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}
