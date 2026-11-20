/**
 * /api/annual-plans — Annual Plans & Budgets library (Sprint 69)
 *
 * POST { title, drive_url, file_type, scope, doc_kind, status, project_id, programme, programme_other,
 *        country, plan_year, period_label }
 *      → adds a link to a project or regional annual plan / budget kept in Google Drive. Nothing is copied or read.
 *      Google Docs / Sheets / Slides links set file_type themselves; for a Drive file staff choose it.
 *      Requires a signed-in @solidaridadnetwork.org account (requireStaff).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { MIN_PLAN_YEAR, UPLOAD_FILE_TYPES, parsePlanLink } from '@/lib/annual-plans'
import { PROGRAMME_OTHER, REPORT_COUNTRIES as PLAN_COUNTRIES } from '@/lib/annual-reports'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS = ['plan', 'budget', 'plan_budget', 'supporting']

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const title = String(b.title ?? '').trim()
  const scope = String(b.scope ?? '')
  const docKind = String(b.doc_kind ?? '')
  const status = String(b.status ?? 'final')
  const programme = String(b.programme ?? '').trim()
  const otherProgramme = String(b.programme_other ?? '').trim()
  const country = String(b.country ?? '')
  const projectId = b.project_id ? String(b.project_id) : null
  const year = Number(b.plan_year)
  const period = String(b.period_label ?? '').trim() || null
  const drive = parsePlanLink(String(b.drive_url ?? ''))
  const fileType = drive?.type ?? String(b.file_type ?? '')
  const maxYear = new Date().getFullYear() + 2

  if (title.length < 3 || title.length > 300) return NextResponse.json({ error: 'Title must be 3–300 characters' }, { status: 400 })
  if (scope !== 'project' && scope !== 'regional') return NextResponse.json({ error: 'Choose project or regional' }, { status: 400 })
  if (!KINDS.includes(docKind)) return NextResponse.json({ error: 'Choose what the file contains' }, { status: 400 })
  if (status !== 'final' && status !== 'draft') return NextResponse.json({ error: 'Choose final or draft' }, { status: 400 })
  if (!programme) return NextResponse.json({ error: 'Programme is required' }, { status: 400 })
  if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  if (!(PLAN_COUNTRIES as readonly string[]).includes(country)) return NextResponse.json({ error: 'Country is required' }, { status: 400 })
  if (!Number.isInteger(year) || year < MIN_PLAN_YEAR || year > maxYear) {
    return NextResponse.json({ error: `Plan year must be between ${MIN_PLAN_YEAR} and ${maxYear}` }, { status: 400 })
  }
  if (period && period.length > 60) return NextResponse.json({ error: 'Period is too long' }, { status: 400 })
  if (!drive) return NextResponse.json({ error: 'Paste the link to one Google Drive file, Doc, Sheet or Slides (not a folder)' }, { status: 400 })
  if (!drive.type && !(UPLOAD_FILE_TYPES as string[]).includes(fileType)) {
    return NextResponse.json({ error: 'Choose the file type' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin.from('annual_plans')
    .select('title').eq('drive_file_id', drive.id).maybeSingle()
  if (existing) return NextResponse.json({ error: `This file is already listed as "${existing.title}"` }, { status: 409 })

  let programmeName: string
  if (projectId) {
    const { data: p } = await supabaseAdmin.from('projects').select('project_name').eq('id', projectId).single()
    if (!p) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
    programmeName = p.project_name
  } else if (programme === PROGRAMME_OTHER) {
    programmeName = otherProgramme.slice(0, 200) || (scope === 'regional' ? 'REC ECA Annual Plan' : PROGRAMME_OTHER)
  } else {
    return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('annual_plans').insert({
    title, scope, doc_kind: docKind, status, programme: programmeName, project_id: projectId, country,
    plan_year: year, period_label: period, drive_file_id: drive.id, source_url: drive.url, file_type: fileType,
    added_by: staff.email,
  }).select('id').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'This file is already listed' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
