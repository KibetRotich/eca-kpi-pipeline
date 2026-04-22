'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'

type Role = 'admin' | 'me_officer' | 'viewer'

interface RoleCtx {
  role:     Role
  canEdit:  boolean
  loading:  boolean
  email:    string | null
}

const RoleContext = createContext<RoleCtx>({ role: 'viewer', canEdit: false, loading: true, email: null })

async function fetchRole(): Promise<RoleCtx> {
  try {
    const d = await fetch('/api/me').then(r => r.json())
    const role: Role = d.role ?? 'viewer'
    return { role, canEdit: role === 'admin' || role === 'me_officer', loading: false, email: d.email ?? null }
  } catch {
    return { role: 'viewer', canEdit: false, loading: false, email: null }
  }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<RoleCtx>({ role: 'viewer', canEdit: false, loading: true, email: null })

  useEffect(() => {
    fetchRole().then(setCtx)

    // Re-check role whenever auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole().then(setCtx)
    })

    return () => subscription.unsubscribe()
  }, [])

  return <RoleContext.Provider value={ctx}>{children}</RoleContext.Provider>
}

export function useRole() { return useContext(RoleContext) }
