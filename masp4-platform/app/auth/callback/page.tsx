'use client'

/**
 * /auth/callback
 * Supabase redirects here after Google OAuth.
 * Exchanges the code for a session, sets the auth cookie, then sends the user to /dashboard.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (!code) { router.replace('/'); return }

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (!error && data.session?.access_token) {
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=3600; SameSite=Lax`
      }
      router.replace('/dashboard')
    })
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', fontSize: '.8rem', color: '#888' }}>
      Signing in…
    </div>
  )
}
