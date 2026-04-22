import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns a 401/403 response if the request is not from an admin or M&E Officer.
 * Returns null when the caller is authorized to proceed.
 */
export async function requireEditor(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = data?.role ?? 'viewer'
  if (role !== 'admin' && role !== 'me_officer') {
    return NextResponse.json(
      { error: 'Insufficient permissions — M&E Officer or Admin access required' },
      { status: 403 }
    )
  }

  return null
}
