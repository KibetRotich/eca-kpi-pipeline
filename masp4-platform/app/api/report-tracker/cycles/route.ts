/**
 * POST /api/report-tracker/cycles — start a new annual reporting cycle (Sprint 62). M&E Officers / Admins only.
 * Body: { name, year, copy_from? } — copy_from (a cycle id) copies that cycle's projects, report types, countries
 * and responsible staff, with deadlines cleared and status "Not started".
 */
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const name = String(b.name ?? '').trim()
  const year = Number(b.year)
  const copyFrom = b.copy_from ? String(b.copy_from) : null
  if (name.length < 3 || name.length > 100) return NextResponse.json({ error: 'Cycle name must be 3–100 characters' }, { status: 400 })
  if (!Number.isInteger(year) || year < 2015 || year > 2100) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  if (copyFrom && !UUID.test(copyFrom)) return NextResponse.json({ error: 'Unknown cycle to copy' }, { status: 400 })

  const { data: cycle, error } = await supabaseAdmin.from('report_cycles')
    .insert({ name, year, created_by: staff.email }).select('id').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'A cycle with this name already exists' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let copied = 0
  if (copyFrom) {
    const { data: rows, error: e2 } = await supabaseAdmin.from('report_tracker')
      .select('project, report_type, country, responsible_names, responsible_emails, sort_order').eq('cycle_id', copyFrom)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    if (rows?.length) {
      const { error: e3 } = await supabaseAdmin.from('report_tracker')
        .insert(rows.map(r => ({ ...r, cycle_id: cycle.id, status: 'not_started', updated_by: staff.email })))
      if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })
      copied = rows.length
    }
  }
  return NextResponse.json({ id: cycle.id, copied }, { status: 201 })
}
