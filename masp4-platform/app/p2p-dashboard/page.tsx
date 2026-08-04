/**
 * /p2p-dashboard — P2P Project Dashboard (Pathways to Prosperity, 2023–2026)
 *
 * Renders the standalone dashboard (HTML + CSS + JS + the AP AR 2023-26
 * workbook) verbatim from /public/p2p/dashboard.html via an iframe, the same way
 * /eca-dashboard embeds the MASP III dashboard. The bundle keeps its own
 * relative asset paths and reads the workbook with fetch(), so embedding it
 * as-is preserves every chart, filter and figure and adds no dependencies.
 */

export const metadata = {
  title: 'P2P Project Dashboard — MASP IV Data Platform',
}

export default function P2pDashboardPage() {
  return (
    <iframe
      src="/p2p/dashboard.html"
      title="P2P Project Dashboard (2023–2026)"
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
