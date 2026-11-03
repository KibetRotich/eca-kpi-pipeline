/**
 * /api/annual-reports — Annual Reports library (Sprint 61)
 *
 * POST { title, drive_url, file_type, report_type, project_id, programme, country, year, period_label }
 *      → adds a link to a donor or country annual report kept in Google Drive. Nothing is copied or summarised.
 *      file_type is 'pdf' or 'docx' for a Drive file; Google Docs links are always 'gdoc'.
 *      Requires a signed-in @solidaridadnetwork.org account (requireStaff).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { MIN_REPORT_YEAR, PROGRAMME_OTHER, REPORT_COUNTRIES, parseDriveLink } from '@/lib/annual-reports'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const title = String(b.title ?? '').trim()
  const reportType = String(b.report_type ?? '')
  const programme = String(b.programme ?? '').trim()
  const otherProgramme = String(b.programme_other ?? '').trim()
  const country = String(b.country ?? '')
  const projectId = b.project_id ? String(b.project_id) : null
  const year = Number(b.year)
  const period = String(b.period_label ?? '').trim() || null
  const drive = parseDriveLink(String(b.drive_url ?? ''))
  const fileType = drive?.type ?? String(b.file_type ?? '')
  const maxYear = new Date().getFullYear() + 1

  if (title.length < 3 || title.length > 300) return NextResponse.json({ error: 'Report Title must be 3–300 characters' }, { status: 400 })
  if (reportType !== 'donor' && reportType !== 'country') return NextResponse.json({ error: 'Choose the report type' }, { status: 400 })
  if (!programme) return NextResponse.json({ error: 'Programme is required' }, { status: 400 })
  if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  if (!(REPORT_COUNTRIES as readonly string[]).includes(country)) return NextResponse.json({ error: 'Country is required' }, { status: 400 })
  if (!Number.isInteger(year) || year < MIN_REPORT_YEAR || year > maxYear) {
    return NextResponse.json({ error: `Year must be between ${MIN_REPORT_YEAR} and ${maxYear}` }, { status: 400 })
  }
  if (period && period.length > 60) return NextResponse.json({ error: 'Reporting period is too long' }, { status: 400 })
  if (!drive) return NextResponse.json({ error: 'Paste the link to one Google Drive file or Google Doc (not a folder)' }, { status: 400 })
  if (!['pdf', 'docx', 'gdoc'].includes(fileType)) return NextResponse.json({ error: 'Choose the file type (PDF or Word)' }, { status: 400 })

  const { data: existing } = await supabaseAdmin.from('annual_reports')
    .select('title').eq('drive_file_id', drive.id).maybeSingle()
  if (existing) return NextResponse.json({ error: `This file is already listed as "${existing.title}"` }, { status: 409 })

  let programmeName: string
  if (projectId) {
    const { data: p } = await supabaseAdmin.from('projects').select('project_name').eq('id', projectId).single()
    if (!p) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
    programmeName = p.project_name
  } else if (programme === PROGRAMME_OTHER) {
    programmeName = otherProgramme.slice(0, 200) || PROGRAMME_OTHER
  } else {
    return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('annual_reports').insert({
    title, report_type: reportType, programme: programmeName, project_id: projectId, country, year,
    period_label: period, drive_file_id: drive.id, source_url: drive.url, file_type: fileType,
    added_by: staff.email,
  }).select('id').single()
  if (error?.code === '23505') return NextResponse.json({ error: 'This file is already listed' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
