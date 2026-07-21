/**
 * /output-insights — Output Insights hub.
 *
 * Landing page for analytics derived from Kobo form submissions. It currently
 * hosts the Climate Heroes / REAP dashboard (rendered verbatim from
 * /public/Seedlings_Dashboard.html via an iframe) and is structured to hold
 * additional static Kobo-form analytics over time.
 */

import SurvivalDashboards from './SurvivalDashboards'

export const metadata = {
  title: 'Output Insights — MASP IV Data Platform',
}

export default function OutputInsightsPage() {
  return (
    <div>
      <header style={{ marginBottom: '.8rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Output Insights</h1>
        <p style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: '#555', maxWidth: 760 }}>
          Analytics built from Kobo data-collection forms. More form dashboards will be added here over time.
        </p>
      </header>

      {/* Climate Heroes / REAP Projects — tree-seedlings request analytics.
          To add another Kobo-form dashboard later, copy this <section> block. */}
      <section>
        <h2 style={{
          margin: '0 0 .5rem',
          fontSize: '.7rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#2e7d32',
        }}>
          Climate Heroes / REAP Projects
        </h2>
        <iframe
          src="/Seedlings_Dashboard.html"
          title="Climate Heroes / REAP Dashboard"
          style={{
            display: 'block',
            width: '100%',
            // Viewport minus sticky header (56) + nav (38) + main padding + this page's heading/section title.
            height: 'calc(100vh - 230px)',
            border: '1px solid #d4d4d4',
            borderRadius: 6,
            background: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,.07)',
          }}
        />
      </section>

      {/* Tree-Survival Monitoring — Harvesting Carbon (Uganda) + SAVE KE (Kenya).
          Two SEPARATE cohort dashboards (never pooled); tab switches between them. */}
      <section style={{ marginTop: '1.4rem' }}>
        <h2 style={{
          margin: '0 0 .5rem',
          fontSize: '.7rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#2e7d32',
        }}>
          Tree Survival Monitoring (Harvesting Carbon / SAVE KE)
        </h2>
        <SurvivalDashboards />
      </section>
    </div>
  )
}
