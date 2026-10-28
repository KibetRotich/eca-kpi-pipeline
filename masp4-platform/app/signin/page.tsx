'use client'

/**
 * /signin — the only page open without a session (Sprint 50, see proxy.ts).
 * If the browser still holds a refreshable Supabase session (e.g. the 1-hour cookie lapsed),
 * it restores the cookie and returns to ?next= without a click; otherwise it offers Google
 * sign-in, limited to @solidaridadnetwork.org accounts.
 */

import { useEffect, useState } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { isStaffEmail, STAFF_DOMAIN } from '@/lib/evaluations'
import { safeNext, setAuthCookie, clearAuthCookie, NEXT_KEY } from '@/lib/auth-cookie'

const BOUNCE_KEY = 'masp4-signin-bounce'

export default function SignInPage() {
  const [state, setState] = useState<'checking' | 'ready' | 'denied' | 'rejected'>('checking')

  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get('next'))
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.access_token && isStaffEmail(session.user.email)) {
        // Came straight back here after just being sent on? The server rejected the session —
        // stop rather than loop.
        const last = Number(sessionStorage.getItem(BOUNCE_KEY) ?? 0)
        if (Date.now() - last < 15_000) {
          sessionStorage.removeItem(BOUNCE_KEY)
          clearAuthCookie()
          await supabase.auth.signOut()
          setState('rejected')
          return
        }
        sessionStorage.setItem(BOUNCE_KEY, String(Date.now()))
        setAuthCookie(session.access_token)
        window.location.replace(next)
        return
      }
      if (session) {
        clearAuthCookie()
        await supabase.auth.signOut()
        setState('denied')
        return
      }
      sessionStorage.setItem(NEXT_KEY, next)
      setState('ready')
    })
  }, [])

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: STAFF_DOMAIN, prompt: 'select_account' },
      },
    })
  }

  if (state === 'checking') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', fontSize: '.8rem', color: '#888' }}>Checking your session…</div>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '55vh' }}>
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderTop: '4px solid #FFC800', padding: '1.8rem 2rem', maxWidth: 420, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111', marginBottom: '.5rem' }}>Sign in to the MASP IV Data Platform</div>
        <p style={{ fontSize: '.72rem', color: '#555', lineHeight: 1.6, margin: '0 0 1.2rem' }}>
          The platform is for Solidaridad staff only. Use your <strong>@{STAFF_DOMAIN}</strong> Google account.
        </p>
        {state === 'denied' && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderLeft: '4px solid #c62828', padding: '.7rem 1rem', fontSize: '.7rem', color: '#c62828', marginBottom: '1rem', textAlign: 'left' }}>
            That account is not a Solidaridad account. Please sign in with your @{STAFF_DOMAIN} email.
          </div>
        )}
        {state === 'rejected' && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderLeft: '4px solid #c62828', padding: '.7rem 1rem', fontSize: '.7rem', color: '#c62828', marginBottom: '1rem', textAlign: 'left' }}>
            The platform could not verify your session, so you have been signed out. Please sign in again; if this
            keeps happening, contact the ECA M&amp;E team.
          </div>
        )}
        <button
          onClick={signIn}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            background: '#111', color: '#FFC800', border: 'none', cursor: 'pointer',
            fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px',
            padding: '.6rem 1.2rem',
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
