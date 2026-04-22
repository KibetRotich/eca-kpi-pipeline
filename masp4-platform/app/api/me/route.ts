/**
 * /api/me
 * Returns the current user's role from user_roles table.
 * Until Google auth is configured, returns 'viewer' for unauthenticated requests.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // Read the Supabase auth token from the cookie
    const token = req.cookies.get('sb-access-token')?.value
                ?? req.cookies.get('supabase-auth-token')?.value

    if (!token) return NextResponse.json({ role: 'viewer', email: null })

    // Verify the token and get the user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return NextResponse.json({ role: 'viewer', email: null })

    const { data } = await supabaseAdmin
      .from('user_roles')
      .select('role, display_name, email')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      role:         data?.role         ?? 'viewer',
      display_name: data?.display_name ?? user.email,
      email:        data?.email        ?? user.email,
    })
  } catch {
    return NextResponse.json({ role: 'viewer', email: null })
  }
}
