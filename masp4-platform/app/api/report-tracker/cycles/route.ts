/**
 * POST /api/report-tracker/cycles — start a new annual reporting cycle (Sprint 62; projects since Sprint 63).
 * M&E Officers / Admins only.
 *
 * Body: { name, year, carry_from? }
 * The cycle lists the projects shown in Projects' Progress (projects.active = true): one row per project, with its
 * name and country, status "Not started" and no deadlines. carry_from (a cycle id) copies each project's
 * responsible staff from the row in that cycle that covers the project (report_tracker.project_ids); projects with
 * no match start unassigned. Non-project reports (e.g. the Internal REC report) are added afterwards with "Add report".
 */
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COUNTRY_ORDER = ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Regional (ECA)']

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const name = String(b.name ?? '').trim()
  const year = Number(b.year)
  const carryFrom = b.carry_from ? String(b.carry_from) : null
  if (name.length < 3 || name.length > 100) return NextResponse.json({ error: 'Cycle name must be 3–100 characters' }, { status: 400 })
  if (!Number.isInteger(year) || year < 2015 || year > 2100) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  if (carryFrom && !UUID.test(carryFrom)) return NextResponse.json({ error: 'Unknown cycle to carry staff from' }, { status: 400 })

  // The projects in Projects' Progress — the same list as /api/projects.
  const { data: projects, error: pErr } = await supabaseAdmin.from('projects')
    .select('id, project_code, project_name, country').eq('active', true)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!projects?.length) return NextResponse.json({ error: 'There are no projects in Projects’ Progress' }, { status: 400 })

  let previous: { project_ids: string[]; responsible_names: string[]; responsible_emails: string[] }[] = []
  if (carryFrom) {
    const { data, error } = await supabaseAdmin.from('report_tracker')
      .select('project_ids, responsible_names, responsible_emails').eq('cycle_id', carryFrom).order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    previous = data ?? []
  }

  const { data: cycle, error } = await supabaseAdmin.from('report_cycles')
    .insert({ name, year, created_by: staff.email }).select('id').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'A cycle with this name already exists' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sorted = [...projects].sort((a, b) =>
    (COUNTRY_ORDER.indexOf(a.country) + 1 || 99) - (COUNTRY_ORDER.indexOf(b.country) + 1 || 99) ||
    a.project_name.localeCompare(b.project_name))
  let carried = 0
  const rows = sorted.map((p, i) => {
    const prev = previous.find(r => r.project_ids.includes(p.id))
    if (prev?.responsible_names.length) carried++
    return {
      cycle_id: cycle.id, sort_order: i + 1, project: p.project_name, project_ids: [p.id], report_type: 'donor',
      country: COUNTRY_ORDER.includes(p.country) ? p.country : null,
      responsible_names: prev?.responsible_names ?? [], responsible_emails: prev?.responsible_emails ?? [],
      status: 'not_started', updated_by: staff.email,
    }
  })
  const { error: insErr } = await supabaseAdmin.from('report_tracker').insert(rows)
  if (insErr) {
    await supabaseAdmin.from('report_cycles').delete().eq('id', cycle.id)   // don't leave an empty cycle behind
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ id: cycle.id, projects: rows.length, carried }, { status: 201 })
}
