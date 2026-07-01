/**
 * /output-insights — Output Insights hub.
 *
 * Landing page for analytics derived from Kobo form submissions. It currently
 * hosts the Climate Heroes / REAP dashboard (rendered verbatim from
 * /public/Seedlings_Dashboard.html via an iframe) and is structured to hold
 * additional Kobo-form analytics over time.
 */

export const metadata = {
  title: 'Output Insights — MASP IV Data Platform',
}

export default function OutputInsightsPage() {
  // The Trainings & Events dashboard is a Streamlit app (a live Python server),
  // not a static file like the dashboards above — so it is hosted separately
  // (Streamlit Community Cloud) and embedded via iframe. Point this env var at
  // the hosted Streamlit URL, e.g. https://<app>.streamlit.app
  const eventsDashboardUrlRaw = process.env.NEXT_PUBLIC_EVENTS_DASHBOARD_URL
  // Streamlit only permits iframe embedding (and hides its chrome/menu) when the
  // app is loaded with ?embed=true. Append it, preserving any existing query.
  const eventsDashboardUrl = eventsDashboardUrlRaw
    ? eventsDashboardUrlRaw + (eventsDashboardUrlRaw.includes('?') ? '&' : '?') + 'embed=true'
    : undefined

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

      {/* ECA Trainings & Events Tracker — training/event delivery analytics.
          Built as a Streamlit app (Python/pandas/plotly): a LIVE SERVER, so
          unlike the static HTML dashboards above it cannot live in /public/.
          It is hosted separately and embedded via iframe here.
          Deployment checklist:
            1. Host the app in eca-events-dashboard/ (Streamlit) — e.g. Streamlit
               Community Cloud, Cloud Run, or behind the platform ingress with
               server.baseUrlPath set.
            2. Set NEXT_PUBLIC_EVENTS_DASHBOARD_URL to that host.
            3. The Streamlit host MUST allow framing by this origin
               (CSP frame-ancestors https://ecadata.solidaridadnetwork.org).
            4. It has no auth of its own — keep it private and gate access behind
               this platform's Supabase auth, or restrict by network.
            5. Automation = a scheduled job refreshing the Kobo data cache
               (MCP-driven, or ingest.py --live with KOBO_TOKEN); Streamlit's
               st.cache_data TTL then serves fresh data. */}
      <section style={{ marginTop: '1.25rem' }}>
        <h2 style={{
          margin: '0 0 .5rem',
          fontSize: '.7rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#2e7d32',
        }}>
          ECA Trainings &amp; Events Tracker
        </h2>
        {eventsDashboardUrl ? (
          <iframe
            src={eventsDashboardUrl}
            title="ECA Trainings & Events Tracker Dashboard"
            style={{
              display: 'block',
              width: '100%',
              height: 'calc(100vh - 230px)',
              border: '1px solid #d4d4d4',
              borderRadius: 6,
              background: '#fff',
              boxShadow: '0 1px 4px rgba(0,0,0,.07)',
            }}
          />
        ) : (
          <p style={{ fontSize: '.78rem', color: '#777', margin: 0 }}>
            Set <code>NEXT_PUBLIC_EVENTS_DASHBOARD_URL</code> to the hosted
            Streamlit URL to embed the Trainings &amp; Events dashboard here.
          </p>
        )}
      </section>
    </div>
  )
}
