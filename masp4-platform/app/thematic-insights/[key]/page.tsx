/**
 * /thematic-insights/<key> — one theme's published cross-study synthesis as a board-level view
 * (Sprint 51: figures and charts; the source-study list and prose were removed). Reviewers read drafts in the review queue.
 */
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import type { Theme, ThemeInsight } from '@/lib/themes'
import ThemeView from '../ThemeView'
import Meter from '../Meter'
import styles from '../themes.module.css'

export const dynamic = 'force-dynamic'

const KEY = /^[a-z_]{2,40}$/

async function getTheme(key: string) {
  if (!KEY.test(key)) return null
  const { data } = await supabaseAdmin.from('evaluation_themes').select('key, title, description, sort_order')
    .eq('key', key).single()
  return data as Theme | null
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const theme = await getTheme((await params).key)
  return { title: `${theme?.title ?? 'Theme'} — Thematic Insights` }
}

export default async function ThemePage({ params }: { params: Promise<{ key: string }> }) {
  const theme = await getTheme((await params).key)
  if (!theme) notFound()

  const { data: insight } = await supabaseAdmin.from('theme_insights')
    .select('id, theme_key, status, synthesis, evidence_rating, source_report_ids, review_note, generated_at, published_at')
    .eq('theme_key', theme.key).eq('status', 'published').maybeSingle()
  const ins = insight as ThemeInsight | null

  const n = ins?.source_report_ids.length ?? 0

  return (
    <div>
      <a href="/thematic-insights" className={styles.back}>← All themes</a>
      <article className={styles.detail}>
        <div className={styles.detailHead}>
          <div>
            <h1>{theme.title}</h1>
            <div className={styles.meta}>{theme.description}</div>
          </div>
          {ins && (
            <div className={styles.rating}>
              <Meter rating={ins.evidence_rating} />
              <span>Based on {n} {n === 1 ? 'study' : 'studies'} · updated{' '}
                {new Date(ins.published_at ?? ins.generated_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
            </div>
          )}
        </div>

        {!ins ? (
          <div className={styles.empty}>
            <strong>Synthesis in preparation</strong>
            The synthesis for this theme will appear here once it has been reviewed by the M&amp;E team.
          </div>
        ) : (
          <ThemeView synthesis={ins.synthesis} />
        )}
      </article>
    </div>
  )
}
