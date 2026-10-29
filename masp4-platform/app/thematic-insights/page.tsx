/**
 * /thematic-insights — Thematic Insights hub (Sprint 49).
 *
 * An overview grid (themes × commodities, Sprint 51) from each published synthesis's board scorecard, then
 * one card per theme (evaluation_themes) with its headline, evidence rating and the number of studies behind it.
 * Each card opens /thematic-insights/<key>.
 * Syntheses draw on the published studies of /evaluation-insights and are written from Claude Code
 * ("synthesise themes"); M&E Officers / Admins review drafts in ThemeReviewQueue before they appear here.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { COMMODITIES, STATUS_LABEL, type CommodityStatus, type Theme, type ThemeInsight } from '@/lib/themes'
import styles from './themes.module.css'
import ThemeReviewQueue from './ThemeReviewQueue'
import Meter from './Meter'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Thematic Insights — MASP IV Data Platform',
}

export default async function ThematicInsightsPage() {
  const [{ data: themes }, { data: insights }, { count }] = await Promise.all([
    supabaseAdmin.from('evaluation_themes').select('key, title, description, sort_order').order('sort_order'),
    supabaseAdmin.from('theme_insights').select('theme_key, synthesis, evidence_rating, source_report_ids')
      .eq('status', 'published'),
    supabaseAdmin.from('evaluation_reports').select('id', { count: 'exact', head: true }).eq('status', 'published'),
  ])
  const byTheme = new Map((insights ?? []).map(i => [i.theme_key, i as Pick<ThemeInsight,
    'theme_key' | 'synthesis' | 'evidence_rating' | 'source_report_ids'>]))
  const themeList = (themes ?? []) as Theme[]

  // Overview grid: only commodities that appear in at least one published scorecard, in the fixed order.
  const status = new Map<string, CommodityStatus>()
  for (const i of byTheme.values())
    for (const r of i.synthesis.board?.scorecard ?? []) status.set(`${i.theme_key}|${r.commodity}`, r.status)
  const cols = COMMODITIES.filter(c => themeList.some(t => status.has(`${t.key}|${c}`)))

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Thematic Insights</h1>
          <p className={styles.intro}>
            What the evidence says across all studies, theme by theme, drawn from the {count ?? 0} published studies
            in <a href="/evaluation-insights">Evaluation Insights</a> (baselines, midlines, endlines, and thematic and
            impact studies).
          </p>
        </div>
      </header>

      <ThemeReviewQueue />

      {cols.length > 0 && (
        <section className={styles.overview} aria-label="Results by theme and commodity">
          <h2>Results at a glance</h2>
          <div className={styles.overviewScroll}>
            <table className={styles.overviewTable}>
              <thead>
                <tr><th scope="col">Theme</th>{cols.map(c => <th key={c} scope="col">{c}</th>)}</tr>
              </thead>
              <tbody>
                {themeList.map(t => (
                  <tr key={t.key}>
                    <th scope="row"><a href={`/thematic-insights/${t.key}`}>{t.title}</a></th>
                    {cols.map(c => {
                      const st = status.get(`${t.key}|${c}`)
                      return (
                        <td key={c} className={st ? styles[`st_${st}`] : styles.st_none}
                            title={`${t.title} · ${c}: ${st ? STATUS_LABEL[st] : 'No evidence'}`}>
                          {st ? STATUS_LABEL[st] : '–'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className={styles.themeGrid}>
        {themeList.map(t => {
          const ins = byTheme.get(t.key)
          return (
            <a key={t.key} href={`/thematic-insights/${t.key}`} className={`${styles.themeCard} ${ins ? '' : styles.pending}`}>
              <h2 className={styles.themeTitle}>{t.title}</h2>
              {ins ? (
                <>
                  <p className={styles.themeHeadline}>{ins.synthesis.headline}</p>
                  <span className={styles.themeFoot}>
                    <Meter rating={ins.evidence_rating} />
                    <span>{ins.source_report_ids.length} {ins.source_report_ids.length === 1 ? 'study' : 'studies'}</span>
                  </span>
                </>
              ) : (
                <>
                  <p className={styles.themeHeadline}>{t.description}</p>
                  <span className={styles.themeFoot}><span>Synthesis in preparation</span></span>
                </>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
