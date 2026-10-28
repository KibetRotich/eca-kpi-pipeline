'use client'

import { useEffect, useState } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import type { User } from '@supabase/supabase-js'
import { setAuthCookie, clearAuthCookie } from '@/lib/auth-cookie'

const YELLOW = '#FFC800'
const BLACK  = '#111'

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.access_token) setAuthCookie(session.access_token)
      setLoading(false)
    })

    // Keep cookie in sync with auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.access_token) setAuthCookie(session.access_token)
      else clearAuthCookie()
    })

    return () => subscription.unsubscribe()
  }, [])

  function signIn() {
    window.location.href = `/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }

  async function signOut() {
    clearAuthCookie()
    await supabase.auth.signOut()
    // Every page needs a session (proxy.ts), so go to the sign-in page
    window.location.href = '/signin'
  }

  if (loading) return null

  if (user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <span style={{ fontSize: '.54rem', color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email}
        </span>
        <button
          onClick={signOut}
          style={{
            background: 'none', border: '1px solid #ccc', cursor: 'pointer',
            fontSize: '.54rem', fontWeight: 700, color: '#555', padding: '.2rem .55rem',
          }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={signIn}
      style={{
        display: 'flex', alignItems: 'center', gap: '.4rem',
        background: BLACK, color: YELLOW,
        border: 'none', cursor: 'pointer',
        fontSize: '.58rem', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '.8px',
        padding: '.3rem .75rem',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
        <path fill="#FFC800" d="M43.6 20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
      </svg>
      Sign in with Google
    </button>
  )
}
