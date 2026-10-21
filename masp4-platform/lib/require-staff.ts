import { supabaseAdmin } from '@/lib/supabase'
import { isStaffEmail } from '@/lib/evaluations'
import { NextRequest, NextResponse } from 'next/server'

export interface StaffUser {
  id: string
  email: string
  role: 'admin' | 'me_officer' | 'viewer'
  canEdit: boolean
}

/**
 * Resolves the signed-in Solidaridad staff member behind a request.
 * Returns a 401/403 response when there is no valid session or the account is not
 * on the staff domain; otherwise the user, with their platform role.
 */
export async function requireStaff(req: NextRequest): Promise<StaffUser | NextResponse> {
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Please sign in with your Solidaridad account' }, { status: 401 })
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json({ error: 'Your session has expired — please sign in again' }, { status: 401 })
  }
  if (!isStaffEmail(user.email)) {
    return NextResponse.json({ error: 'Only Solidaridad staff accounts can do this' }, { status: 403 })
  }

  const { data } = await supabaseAdmin.from('user_roles').select('role').eq('id', user.id).single()
  const role = (data?.role ?? 'viewer') as StaffUser['role']
  return { id: user.id, email: user.email!.toLowerCase(), role, canEdit: role === 'admin' || role === 'me_officer' }
}
