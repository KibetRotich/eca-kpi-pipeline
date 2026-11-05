/**
 * /output-insights — Output Insights hub (the "Granular Data" nav button).
 *
 * Compact tile grid of Kobo-form dashboards, sized like the Projects' Progress project
 * tiles (as many 230px+ columns as fit). Each tile is a single link to a dashboard;
 * the full description and complete tag list are preserved in the markup
 * (visually condensed via line-clamp / a "+N more" chip, fully available to
 * screen readers). Styling lives in ./page.module.css and reuses the global
 * design tokens (app/globals.css) — no other page is affected.
 *
 * To add a dashboard: append an entry to DASHBOARDS in ./dashboards.ts. Every tile opens in the
 * same window — static dashboards inside the platform viewer (/output-insights/view/<slug>).
 */
import Link from 'next/link'
import styles from './page.module.css'
import { DASHBOARDS, dashboardLink, type Dashboard } from './dashboards'

export const metadata = {
  title: 'Output Insights — ECA PMEL Platform',
}

const MAX_VISIBLE_CHIPS = 3

function DashboardTile({ d }: { d: Dashboard }) {
  const visible = d.chips.slice(0, MAX_VISIBLE_CHIPS)
  const hidden = d.chips.slice(MAX_VISIBLE_CHIPS)
  return (
    <Link href={dashboardLink(d)} className={styles.tile}>
      {/* Heading level h2 matches the previous section headings. */}
      <h2 className={styles.title}>{d.title}</h2>
      {/* Full description kept in the DOM (line-clamped visually, tooltip + read in full by screen readers). */}
      <p className={styles.summary} title={d.blurb}>{d.blurb}</p>
      <div className={styles.tags}>
        {visible.map((c) => (
          <span key={c} className={styles.tag}>{c}</span>
        ))}
        {hidden.length > 0 && (
          <span className={styles.more} aria-hidden="true" title={hidden.join(', ')}>
            +{hidden.length} more
          </span>
        )}
      </div>
      {/* Complete tag list preserved for screen readers / future-proofing. */}
      <span className={styles.srOnly}>Topics: {d.chips.join(', ')}.</span>
      <span className={styles.cta}>
        Open dashboard <span aria-hidden="true">→</span>
      </span>
    </Link>
  )
}

export default function OutputInsightsPage() {
  return (
    <div>
      <header style={{ marginBottom: '.9rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Output Insights</h1>
        <p style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: '#555', maxWidth: 760 }}>
          Analytics built from Kobo data-collection forms. More form dashboards will be added here over time.
        </p>
      </header>

      <div className={styles.grid}>
        {DASHBOARDS.map((d) => (
          <DashboardTile key={d.slug} d={d} />
        ))}
      </div>
    </div>
  )
}
