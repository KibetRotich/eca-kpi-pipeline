/**
 * /api/report-tracker/<id> — update or delete one tracker row (Sprint 62).
 *
 * PATCH body (all optional):
 *   status, note                         — the responsible staff (email in responsible_emails) or M&E / Admin
 *   final: { drive_url, file_type, title } — attach a final report: the Drive link is added to annual_reports
 *                                          (Library) if it is not there yet, and linked to this row
 *   remove_report_id                     — unlink a final report from the row (the Library entry stays)
 *   project, project_ids, report_type, country, responsible, deadline_cm, deadline_hop, deadline_donor
 *                                        — also the responsible staff or M&E / Admin (full edit rights on their own rows)
 * "Final filed" needs at least one linked final report. Every change is logged in report_tracker_log.
 *
 * DELETE — M&E Officers / Admins only.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { TRACKER_STATUSES, canEditRow, rowFields } from '@/lib/report-tracker'
import { parseDriveLink } from '@/lib/annual-reports'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROW_FIELDS = ['project', 'project_ids', 'report_type', 'country', 'responsible', 'deadline_cm', 'deadline_hop', 'deadline_donor']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { data: row } = await supabaseAdmin.from('report_tracker')
    .select('*, report_cycles(year)').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canEditRow(row, staff.email, staff.canEdit)) {
    return NextResponse.json({ error: 'Only the responsible staff or an M&E Officer / Admin can update this report' }, { status: 403 })
  }

  // Row fields + note (the responsible staff of this row, or M&E / Admin)
  const fields: Record<string, unknown> = {}
  const editable = Object.fromEntries(Object.entries(b).filter(([k]) => [...ROW_FIELDS, 'note'].includes(k)))
  if (Object.keys(editable).length) {
    const f = rowFields(editable, true)
    if (typeof f === 'string') return NextResponse.json({ error: f }, { status: 400 })
    Object.assign(fields, f)
  }

  let reportIds: string[] = [...row.annual_report_ids]

  if (b.remove_report_id) {
    reportIds = reportIds.filter(r => r !== String(b.remove_report_id))
  }

  if (b.final) {
    const fin = b.final as Record<string, unknown>
    const drive = parseDriveLink(String(fin.drive_url ?? ''))
    if (!drive) return NextResponse.json({ error: 'Paste the link to one Google Drive file or Google Doc (not a folder)' }, { status: 400 })
    const fileType = drive.type ?? String(fin.file_type ?? '')
    if (!['pdf', 'docx', 'gdoc'].includes(fileType)) return NextResponse.json({ error: 'Choose the file type (PDF or Word)' }, { status: 400 })
    const title = String(fin.title ?? '').trim()

    const { data: existing } = await supabaseAdmin.from('annual_reports').select('id').eq('drive_file_id', drive.id).maybeSingle()
    let reportId = existing?.id as string | undefined
    if (!reportId) {
      if (title.length < 3 || title.length > 300) return NextResponse.json({ error: 'Report title must be 3–300 characters' }, { status: 400 })
      const { data: ins, error } = await supabaseAdmin.from('annual_reports').insert({
        title, report_type: row.report_type, programme: row.project, project_id: null,
        country: row.country ?? 'Regional (ECA)', year: row.report_cycles?.year ?? new Date().getFullYear(),
        drive_file_id: drive.id, source_url: drive.url, file_type: fileType, added_by: staff.email,
      }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      reportId = ins.id
    }
    if (!reportIds.includes(reportId!)) reportIds.push(reportId!)
  }

  if (b.status !== undefined) {
    const s = String(b.status)
    if (!(TRACKER_STATUSES as readonly string[]).includes(s)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    fields.status = s
  }
  if (reportIds.join() !== row.annual_report_ids.join()) fields.annual_report_ids = reportIds
  if ((fields.status ?? row.status) === 'final_filed' && reportIds.length === 0) {
    return NextResponse.json({ error: 'Add the Drive link of the final report to mark it Final filed' }, { status: 400 })
  }

  // Log only what actually changed
  const changes: Record<string, [unknown, unknown]> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (JSON.stringify(row[k] ?? null) !== JSON.stringify(v ?? null)) changes[k] = [row[k] ?? null, v ?? null]
  }
  if (!Object.keys(changes).length) return NextResponse.json({ ok: true, unchanged: true })

  const { error } = await supabaseAdmin.from('report_tracker')
    .update({ ...fields, updated_by: staff.email, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (changes.responsible_emails) await rememberStaff(fields.responsible_names, fields.responsible_emails, staff.email)
  await supabaseAdmin.from('report_tracker_log').insert({ tracker_id: id, changed_by: staff.email, changes })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabaseAdmin.from('report_tracker').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

/**
 * Saves responsible staff typed into the tracker picker to staff_directory (Sprint 64), so they appear in the
 * dropdown next time. Existing entries are left as they are. Best effort: a failure never blocks the tracker save.
 */
async function rememberStaff(names: unknown, emails: unknown, by: string) {
  if (!Array.isArray(names) || !Array.isArray(emails)) return
  const rows = emails.map((e, i) => ({ email: String(e), name: String(names[i] ?? e), source: 'manual', added_by: by }))
    .filter(r => r.email)
  if (rows.length) await supabaseAdmin.from('staff_directory').upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
}
