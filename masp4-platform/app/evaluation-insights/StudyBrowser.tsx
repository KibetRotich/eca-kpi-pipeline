'use client'

/**
 * Evaluation Insights hub body: Stage / Country / Theme filters above the published study tiles.
 * Filter options come from the published studies passed in.
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

export default function StudyBrowser({ studies }: { studies: Study[] }) {
  const [stage, setStage] = useState('')
  const [country, setCountry] = useState('')
  const [theme, setTheme] = useState('')

  const options = useMemo(() => {
    const tally = (keys: string[]) => {
      const m = new Map<string, number>()
      keys.forEach(k => m.set(k, (m.get(k) ?? 0) + 1))
      return m
    }
    const byStage = tally(studies.map(s => studyStage(s.tags)))
    const byCountry = tally(studies.map(s => s.country))
    const byTheme = tally(studies.flatMap(s => s.tags.filter(t => (THEME_TAGS as string[]).includes(t))))
    const stageOrder = [...STAGES, 'Study'].filter(st => byStage.has(st))
    const countries = [...byCountry.keys()].sort((a, b) => (byCountry.get(b)! - byCountry.get(a)!) || a.localeCompare(b))
    return {
      stages: stageOrder.map(st => [st, byStage.get(st)!] as [string, number]),
      countries: countries.map(c => [c, byCountry.get(c)!] as [string, number]),
      themes: [...byTheme.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [studies])

  const shown = studies.filter(s =>
    (!stage || studyStage(s.tags) === stage) && (!country || s.country === country) && (!theme || s.tags.includes(theme)))
  const filtered = !!(stage || country || theme)

  return (
    <>

      <div className={styles.filterBar}>
        <label>Stage
          <select value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">All</option>
            {options.stages.map(([s]) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Country
          <select value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All</option>
            {options.countries.map(([c]) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Theme
          <select value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="">All</option>
            {options.themes.map(([t]) => <option key={t}>{t}</option>)}
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
