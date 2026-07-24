/**
 * /eca-dashboard — MASP III ECA Projects Dashboard (2021–2025)
 *
 * Renders the self-contained legacy dashboard (HTML + inline CSS/JS + embedded
 * dataset + Chart.js) verbatim from /public/ECA_Dashboard.html via an iframe.
 * Embedding the file as-is preserves every chart, table, value and style with
 * zero content loss and adds no new dependencies — it is the exact artifact
 * deployed at eca-dashboard-2025.netlify.app/eca_dashboard.
 */

export const metadata = {
  title: 'MASP III Dashboard — MASP IV Data Platform',
}

export default function EcaDashboardPage() {
  return (
    <iframe
      src="/ECA_Dashboard.html"
      title="MASP III ECA Projects Dashboard (2021–2025)"
      style={{
        display: 'block',
        width: '100%',
        // Viewport minus sticky header (56) + nav (38) + main top/bottom padding.
        height: 'calc(100vh - 150px)',
        border: '1px solid #d4d4d4',
        borderRadius: 6,
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.07)',
      }}
    />
  )
}
