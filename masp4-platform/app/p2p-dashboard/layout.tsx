/**
 * Auth gate for /p2p-dashboard.
 *
 * requireOrgSession() verifies the token signature and the email domain, and
 * redirects to /signin otherwise. The page itself only embeds a static file,
 * but the gate keeps P2P figures unreadable without a verified
 * @solidaridadnetwork.org session.
 */

import { requireOrgSession } from '@/lib/require-org-session'

export default async function P2pDashboardLayout({ children }: { children: React.ReactNode }) {
  await requireOrgSession()
  return <>{children}</>
}
