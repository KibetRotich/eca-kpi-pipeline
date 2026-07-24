'use client'

/**
 * /auth/callback
 * Supabase redirects here after Google OAuth.
 * Handles both PKCE (?code=) and implicit (#access_token=) flows.
 * Uses hard navigation to /dashboard so AuthButton re-runs getSession() fresh.
 */

import { useEffect, useState } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

export default function AuthCallbackPage() {
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    // Errors arrive in either query string or hash
    const oauthError = query.get('error') ?? hash.get('error')
    const oauthDesc  = query.get('error_description') ?? hash.get('error_description')
    if (oauthError) {
      const msg = oauthDesc ? decodeURIComponent(oauthDesc.replace(/\+/g, ' ')) : oauthError
      console.error('[auth/callback] OAuth error:', msg)
      setAuthError(msg)
      return
    }

    // PKCE flow — code arrives as ?code= query param
    const code = query.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          console.error('[auth/callback] PKCE exchange failed:', error.message)
          setAuthError(error.message)
          return
        }
        if (data.session?.access_token) {
          document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=3600; SameSite=Lax`
        }
        // Hard navigation forces AuthButton to re-run getSession() on a clean mount
        window.location.href = '/dashboard'
      })
      return
    }

    // Implicit flow fallback — tokens arrive as #access_token= hash fragment
    const accessToken  = hash.get('access_token')
    const refreshToken = hash.get('refresh_token') ?? ''
    if (accessToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ data, error }) => {
        if (error) {
          console.error('[auth/callback] setSession failed:', error.message)
          setAuthError(error.message)
          return
        }
        if (data.session?.access_token) {
          document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=3600; SameSite=Lax`
        }
        window.location.href = '/dashboard'
      })
      return
    }

    // Nothing recognisable — send home
    window.location.href = '/'
  }, [])

  if (authError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '1rem' }}>
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderLeft: '4px solid #c62828', padding: '1rem 1.4rem', maxWidth: 480, fontSize: '.75rem', color: '#c62828', lineHeight: 1.6 }}>
          <strong style={{ display: 'block', marginBottom: '.4rem' }}>Sign-in failed</strong>
          {authError}
        </div>
        <a href="/" style={{ fontSize: '.7rem', color: '#1a3557', fontWeight: 700 }}>Try again</a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', fontSize: '.8rem', color: '#888' }}>
      Signing in…
    </div>
  )
}
