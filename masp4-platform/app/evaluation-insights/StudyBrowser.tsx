'use client'

/**
 * Evaluation Insights hub body: Country / Study type / Commodity filters (Sprint 52), then one compact tile
 * per published study, linking to /evaluation-insights/<id>. A study with no commodities is programme-wide.
 */
import { useMemo, useState } from 'react'
import { EVAL_COMMODITIES, formatPeriod, type EvaluationSummary } from '@/lib/evaluations'
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
  commodities: string[]
  summary: EvaluationSummary | null
}

const PROGRAMME_WIDE = 'Programme-wide'

function StudyTile({ s }: { s: Study }) {
  const kicker = [s.country, studyStage(s.tags)].filter(Boolean).join(' · ')
  const blurb = s.summary?.headline ?? ''
  return (
    <a href={`/evaluation-insights/${s.id}`} className={styles.studyTile}
       title={[s.programme, s.tags.join(', ')].filter(Boolean).join(' — ')}>
      <span className={styles.studyKicker}>{kicker}</span>
      <h2 className={styles.studyTitle}>{s.title}</h2>
      <span className={styles.studyCommodity}>{s.commodities.length ? s.commodities.join(', ') : PROGRAMME_WIDE}</span>
      {blurb && <p className={styles.studyHeadline}>{blurb}</p>}
      <span className={styles.studyFoot}>
        <span>{formatPeriod(s.period_start, s.period_end)}</span>
        <span>Read insights <span aria-hidden="true">→</span></span>
      </span>
    </a>
  )
}

export default function StudyBrowser({ studies }: { studies: Study[] }) {
  const [country, setCountry] = useState('')
  const [stage, setStage] = useState('')
  const [commodity, setCommodity] = useState('')

  // Only offer options that at least one study has, in a fixed order.
  const countries = useMemo(() => [...new Set(studies.map(s => s.country))].sort(), [studies])
  const stages = useMemo(() => {
    const have = new Set(studies.map(s => studyStage(s.tags)))
    return [...STAGES, 'Study'].filter(s => have.has(s))
  }, [studies])
  const commodities = useMemo(() => {
    const have = new Set(studies.flatMap(s => s.commodities))
    const list: string[] = EVAL_COMMODITIES.filter(c => have.has(c))
    return studies.some(s => !s.commodities.length) ? [...list, PROGRAMME_WIDE] : list
  }, [studies])

  const shown = studies.filter(s =>
    (!country || s.country === country) &&
    (!stage || studyStage(s.tags) === stage) &&
    (!commodity || (commodity === PROGRAMME_WIDE ? !s.commodities.length : s.commodities.includes(commodity))))
  const filtered = !!(country || stage || commodity)

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Filter studies">
        <label>
          Country
          <select value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Study type
          <select value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">All study types</option>
            {stages.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Commodity
          <select value={commodity} onChange={e => setCommodity(e.target.value)}>
            <option value="">All commodities</option>
            {commodities.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <span className={styles.filterCount} aria-live="polite">
          {filtered ? `${shown.length} of ${studies.length} studies` : `${studies.length} studies`}
        </span>
        {filtered && (
          <button type="button" className={styles.clearFilters}
                  onClick={() => { setCountry(''); setStage(''); setCommodity('') }}>Clear filters</button>
        )}
      </div>

      {shown.length ? (
        <div className={styles.studyGrid}>
          {shown.map(s => <StudyTile key={s.id} s={s} />)}
        </div>
      ) : (
        <p className={styles.noMatch}>No studies match these filters.</p>
      )}
    </>
  )
}
