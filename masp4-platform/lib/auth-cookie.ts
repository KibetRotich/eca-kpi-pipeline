/**
 * The session cookie that server code (proxy.ts, requireStaff, requireEditor, /api/me) reads.
 * The browser Supabase client keeps the real session; this cookie mirrors its access token and is
 * refreshed on every auth state change (supabase-js refreshes the token before it expires).
 * Safe to import from client and server code.
 */

export const AUTH_COOKIE = 'sb-access-token'

/** sessionStorage key holding the page to return to across the Google round trip. */
export const NEXT_KEY = 'masp4-signin-next'

/** Where to go after signing in: only same-site paths, never back to the sign-in page. */
export function safeNext(next: string | null | undefined, fallback = '/targets'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/signin')) return fallback
  return next
}

export function setAuthCookie(token: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${AUTH_COOKIE}=${token}; path=/; max-age=3600; SameSite=Lax${secure}`
}

export function clearAuthCookie() {
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}
