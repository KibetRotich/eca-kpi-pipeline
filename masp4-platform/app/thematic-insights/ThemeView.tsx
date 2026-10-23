'use client'

/**
 * Renders one theme synthesis (used by the theme page and the review queue).
 * Every point lists the studies it is drawn from; the Country and Stage filters narrow the points to those
 * backed by at least one matching study, so readers can see e.g. only the Kenya endline evidence.
 */
import { useMemo, useState } from 'react'
import { studyStage, type CitedPoint, type SourceStudy, type ThemeSynthesis } from '@/lib/themes'
import styles from './themes.module.css'

function Sources({ ids, studies }: { ids: string[]; studies: Record<string, SourceStudy> }) {
  const known = ids.filter(id => studies[id])
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

function Points({ title, items, studies }: { title: string; items: CitedPoint[]; studies: Record<string, SourceStudy> }) {
  if (!items.length) return null
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((p, i) => (
          <li key={i}>{p.text} <Sources ids={p.sources} studies={studies} /></li>
        ))}
      </ul>
    </section>
  )
}

export default function ThemeView({ synthesis, studies, filterable = true }: {
  synthesis: ThemeSynthesis
  studies: Record<string, SourceStudy>
  filterable?: boolean
}) {
  const [country, setCountry] = useState('')
  const [stage, setStage] = useState('')

  const countries = useMemo(() => [...new Set(Object.values(studies).map(s => s.country))].sort(), [studies])
  const stages = useMemo(() => [...new Set(Object.values(studies).map(s => studyStage(s.tags)))].sort(), [studies])

  const matches = (id: string) => {
    const s = studies[id]
    return !!s && (!country || s.country === country) && (!stage || studyStage(s.tags) === stage)
  }
  const keep = (items: CitedPoint[]) => (country || stage) ? items.filter(p => p.sources.some(matches)) : items
  const trends = (country || stage)
    ? synthesis.change_over_time.filter(c => c.points.some(p => matches(p.source)))
    : synthesis.change_over_time

  const evidence = keep(synthesis.key_evidence)
  const works = keep(synthesis.what_works)
  const barriers = keep(synthesis.barriers)
  const recs = keep(synthesis.recommendations)
  const nothing = !evidence.length && !works.length && !barriers.length && !recs.length && !trends.length

  return (
    <div className={styles.synthesis}>
      <p className={styles.aiNote}>
        AI-generated synthesis of the published studies, reviewed by the M&amp;E team. Findings come from studies with
        different designs and years, so they are reported side by side, not added up. Check figures against the source study.
      </p>
      <p className={styles.headline}>{synthesis.headline}</p>

      {filterable && (
        <div className={styles.filters}>
          <label>
            Country
            <select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">All</option>
              {countries.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Stage
            <select value={stage} onChange={e => setStage(e.target.value)}>
              <option value="">All</option>
              {stages.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          {(country || stage) && (
            <button type="button" className={styles.clear} onClick={() => { setCountry(''); setStage('') }}>Clear</button>
          )}
        </div>
      )}

      {nothing && <p className={styles.none}>No evidence in this theme matches the filters.</p>}

      <Points title="Key evidence" items={evidence} studies={studies} />

      {trends.length > 0 && (
        <section>
          <h3>Change over time</h3>
          <div className={styles.trends}>
            {trends.map((c, i) => (
              <div key={i} className={styles.trend}>
                <div className={styles.trendHead}>{c.project} <span>{c.country}</span></div>
                <ol className={styles.timeline}>
                  {c.points.map((p, j) => (
                    <li key={j}>
                      <a href={`/evaluation-insights/${p.source}`} className={styles.stage}>{p.stage} {p.year}</a>
                      <span>{p.finding}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      {(works.length > 0 || barriers.length > 0) && (
        <div className={styles.twoCol}>
          <Points title="What works" items={works} studies={studies} />
          <Points title="What holds results back" items={barriers} studies={studies} />
        </div>
      )}

      <Points title="Recommendations for programming" items={recs} studies={studies} />

      {synthesis.evidence_gaps.length > 0 && (
        <section>
          <h3>Evidence gaps &amp; caveats</h3>
          <ul>{synthesis.evidence_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
