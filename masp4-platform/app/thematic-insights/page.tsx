/**
 * /thematic-insights — Thematic Insights hub (Sprint 49).
 *
 * One card per theme (evaluation_themes) with its headline, evidence rating and the number of studies behind it.
 * Each card opens /thematic-insights/<key>.
 * Syntheses draw on the published studies of /evaluation-insights and are written from Claude Code
 * ("synthesise themes"); M&E Officers / Admins review drafts in ThemeReviewQueue before they appear here.
 */
import { supabaseAdmin } from '@/lib/supabase'
import type { Theme, ThemeInsight } from '@/lib/themes'
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
