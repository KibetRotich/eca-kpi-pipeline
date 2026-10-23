'use client'

/**
 * Evaluation Insights hub body: an overview of the published studies (headline numbers, studies by stage,
 * country and theme, and a country × stage coverage grid) above the study tiles.
 * Clicking a bar or a grid cell filters the tiles; the Stage / Country / Theme selects do the same.
 * All counts come from the published studies passed in — nothing is estimated.
 */
import { useMemo, useState } from 'react'
import { EVAL_TAGS, formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
import { STAGES, studyStage } from '@/lib/themes'
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

const THEME_TAGS = EVAL_TAGS.filter(t => !(STAGES as readonly string[]).includes(t) && t !== 'Learning review')

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

/** Horizontal bar list; clicking a row toggles it as a filter. */
function BarList({ title, counts, selected, onPick }: {
  title: string
  counts: [string, number][]
  selected: string
  onPick: (v: string) => void
}) {
  const max = Math.max(1, ...counts.map(([, n]) => n))
  return (
    <figure className={styles.ovCard}>
      <figcaption>{title}</figcaption>
      {counts.map(([label, n]) => (
        <button key={label} type="button" onClick={() => onPick(selected === label ? '' : label)}
                className={`${styles.barRow} ${selected === label ? styles.barOn : ''} ${selected && selected !== label ? styles.barDim : ''}`}
                aria-pressed={selected === label} title={`${label}: ${n} ${n === 1 ? 'study' : 'studies'} — click to filter`}>
          <span className={styles.barLabel}>{label}</span>
          <span className={styles.barTrack}><span className={styles.barFill} style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className={styles.barNum}>{n}</span>
        </button>
      ))}
    </figure>
  )
}

export default function StudyBrowser({ studies }: { studies: Study[] }) {
  const [stage, setStage] = useState('')
  const [country, setCountry] = useState('')
  const [theme, setTheme] = useState('')

  const overview = useMemo(() => {
    const tally = (keys: string[]) => {
      const m = new Map<string, number>()
      keys.forEach(k => m.set(k, (m.get(k) ?? 0) + 1))
      return m
    }
    const byStage = tally(studies.map(s => studyStage(s.tags)))
    const byCountry = tally(studies.map(s => s.country))
    const byTheme = tally(studies.flatMap(s => s.tags.filter(t => (THEME_TAGS as string[]).includes(t))))
    const years = studies.flatMap(s => [s.period_start, s.period_end]).filter(Boolean).map(d => Number(d!.slice(0, 4)))
    const stageOrder = [...STAGES, 'Study'].filter(st => byStage.has(st))
    const countries = [...byCountry.keys()].sort((a, b) => (byCountry.get(b)! - byCountry.get(a)!) || a.localeCompare(b))
    return {
      stages: stageOrder.map(st => [st, byStage.get(st)!] as [string, number]),
      countries: countries.map(c => [c, byCountry.get(c)!] as [string, number]),
      themes: [...byTheme.entries()].sort((a, b) => b[1] - a[1]),
      endlines: byStage.get('Endline') ?? 0,
      span: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '—',
      grid: countries.map(c => ({
        country: c,
        cells: stageOrder.map(st => studies.filter(s => s.country === c && studyStage(s.tags) === st).length),
      })),
      stageOrder,
    }
  }, [studies])

  const shown = studies.filter(s =>
    (!stage || studyStage(s.tags) === stage) && (!country || s.country === country) && (!theme || s.tags.includes(theme)))
  const gridMax = Math.max(1, ...overview.grid.flatMap(r => r.cells))
  const filtered = !!(stage || country || theme)

  return (
    <>
      <section className={styles.overview} aria-label="Overview of published studies">
        <div className={styles.stats}>
          <div><b>{studies.length}</b><span>published studies</span></div>
          <div><b>{overview.countries.length}</b><span>countries / regional</span></div>
          <div><b>{overview.endlines}</b><span>endline evaluations</span></div>
          <div><b>{overview.span}</b><span>project periods covered</span></div>
        </div>

        <div className={styles.ovGrid}>
          <BarList title="Studies by stage" counts={overview.stages} selected={stage} onPick={setStage} />
          <BarList title="Studies by country" counts={overview.countries} selected={country} onPick={setCountry} />
          <BarList title="Studies by theme" counts={overview.themes} selected={theme} onPick={setTheme} />

          <figure className={styles.ovCard}>
            <figcaption>Evidence coverage: country × stage</figcaption>
            <table className={styles.matrix}>
              <thead>
                <tr><th />{overview.stageOrder.map(st => <th key={st} scope="col">{st.replace('Impact evaluation', 'Impact').replace('Thematic study', 'Thematic')}</th>)}</tr>
              </thead>
              <tbody>
                {overview.grid.map(r => (
                  <tr key={r.country}>
                    <th scope="row">{r.country}</th>
                    {r.cells.map((n, j) => {
                      const st = overview.stageOrder[j]
                      const on = country === r.country && stage === st
                      return (
                        <td key={st}>
                          {n > 0 ? (
                            <button type="button" className={`${styles.cell} ${on ? styles.cellOn : ''}`}
                                    style={{ background: `rgba(42, 120, 214, ${0.12 + 0.88 * (n / gridMax)})`, color: n / gridMax > 0.45 ? '#fff' : '#0b0b0b' }}
                                    title={`${r.country} · ${st}: ${n} ${n === 1 ? 'study' : 'studies'} — click to filter`}
                                    onClick={() => { if (on) { setCountry(''); setStage('') } else { setCountry(r.country); setStage(st) } }}>
                              {n}
                            </button>
                          ) : <span className={styles.cellEmpty} title={`${r.country} · ${st}: no studies`}>·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.ovNote}>Empty cells show where no study exists yet.</p>
          </figure>
        </div>
      </section>

      <div className={styles.filterBar}>
        <label>Stage
          <select value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">All</option>
            {overview.stages.map(([s]) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Country
          <select value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All</option>
            {overview.countries.map(([c]) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Theme
          <select value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="">All</option>
            {overview.themes.map(([t]) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <span className={styles.filterCount}>
          Showing {shown.length} of {studies.length} studies
          {filtered && <button type="button" onClick={() => { setStage(''); setCountry(''); setTheme('') }}>Clear filters</button>}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className={styles.meta}>No published study matches these filters.</p>
      ) : (
        <div className={styles.studyGrid}>
          {shown.map(s => <StudyTile key={s.id} s={s} />)}
        </div>
      )}
    </>
  )
}
