/**
 * POST /api/report-tracker — add a report to a tracker cycle (Sprint 62). M&E Officers / Admins only.
 * Body: { cycle_id, project, report_type, country, responsible, deadline_cm, deadline_hop, deadline_donor, note }
 *       `responsible` is "Name <email>" entries separated by new lines, commas or semicolons.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { rowFields } from '@/lib/report-tracker'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const cycleId = String(b.cycle_id ?? '')
  if (!UUID.test(cycleId)) return NextResponse.json({ error: 'Unknown reporting cycle' }, { status: 400 })
  const fields = rowFields(b, false)
  if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 })

  const { data: last } = await supabaseAdmin.from('report_tracker').select('sort_order')
    .eq('cycle_id', cycleId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await supabaseAdmin.from('report_tracker')
    .insert({ ...fields, cycle_id: cycleId, sort_order: (last?.sort_order ?? 0) + 1, updated_by: staff.email })
    .select('id').single()
  if (error?.code === '23503') return NextResponse.json({ error: 'Unknown reporting cycle' }, { status: 400 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('report_tracker_log').insert({ tracker_id: data.id, changed_by: staff.email, changes: { created: [null, fields.project] } })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
