/**
 * DELETE /api/annual-reports/<id> — removes a wrong or duplicate link from the Annual Reports list
 * (the file in Google Drive is not touched). M&E Officers and Admins only.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin.from('annual_reports').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
