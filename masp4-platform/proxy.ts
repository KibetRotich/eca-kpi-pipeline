/**
 * Staff-only gate (Sprint 50). Every page, API route and static dashboard in /public needs a
 * signed-in @solidaridadnetwork.org session; nothing on the platform is public.
 *
 * The session JWT (cookie sb-access-token) is verified locally against the project's ES256
 * signing keys (getClaims caches the JWKS), so there is no Auth round trip per request.
 * Pages without a valid session redirect to /signin?next=<path> — which silently restores an
 * expired-but-refreshable session — and API routes answer 401.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isStaffEmail } from '@/lib/evaluations'
import { AUTH_COOKIE } from '@/lib/auth-cookie'

const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
}).auth

async function isStaffSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const { data } = await auth.getClaims(token)
    return !!data && isStaffEmail(data.claims.email as string | undefined)
  } catch {
    return false
  }
}

export async function proxy(req: NextRequest) {
  if (await isStaffSession(req.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next()

  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Please sign in with your Solidaridad account' }, { status: 401 })
  }
  const to = req.nextUrl.clone()
  to.pathname = '/signin'
  to.search = ''
  to.searchParams.set('next', pathname + search)
  return NextResponse.redirect(to)
}

export const config = {
  // Everything except the sign-in flow itself and the assets it needs to render
  matcher: ['/((?!signin|auth/callback|_next/static|_next/image|favicon\\.ico|solidaridad-logo\\.png).*)'],
}
