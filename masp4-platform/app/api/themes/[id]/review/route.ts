/**
 * POST /api/themes/<id>/review { action } — M&E Officer / Admin review of a theme synthesis draft.
 *
 *   publish  draft → published   (the theme's previous published synthesis becomes 'superseded')
 *   reject   draft → rejected    (kept, never shown)
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let action = ''
  try { action = String((await req.json()).action ?? '') } catch { /* handled below */ }
  if (action !== 'publish' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be publish or reject' }, { status: 400 })
  }

  if (action === 'publish') {
    const { data: ok, error } = await supabaseAdmin.rpc('publish_theme_insight', { p_id: id, p_reviewer: staff.email })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!ok) return NextResponse.json({ error: 'Only a draft can be published' }, { status: 409 })
    return NextResponse.json({ status: 'published' })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('theme_insights')
    .update({ status: 'rejected', reviewed_by: staff.email, reviewed_at: now, updated_at: now })
    .eq('id', id).eq('status', 'draft').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Only a draft can be rejected' }, { status: 409 })
  return NextResponse.json({ status: 'rejected' })
}
