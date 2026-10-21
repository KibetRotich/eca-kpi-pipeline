/**
 * POST /api/evaluations/<id>/process — start the summarisation pipeline for an uploaded report.
 *
 * Called by the browser right after it has uploaded the file. Checks the file is in storage, marks the
 * report 'processing' and returns 202 at once; the Claude summary runs after the response (next/server
 * `after`) and leaves the report as a 'draft' for review, or 'failed' with a reason. Without an
 * ANTHROPIC_API_KEY the report is marked 'queued' instead (its summary is written later from Claude Code).
 * Allowed for the person who uploaded it, or an M&E Officer / Admin.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { canAutoSummarise, summariseEvaluation } from '@/lib/summarise-evaluation'
import { after, NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: row } = await supabaseAdmin.from('evaluation_reports')
    .select('id, status, uploaded_by, file_path').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.uploaded_by !== staff.email && !staff.canEdit) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  if (row.status !== 'uploading') {
    return NextResponse.json({ error: `This report is already ${row.status}` }, { status: 409 })
  }

  // The object must be in the bucket before we hand it to the pipeline.
  if (!row.file_path) return NextResponse.json({ error: 'This report has no uploaded file' }, { status: 409 })
  const dir = row.file_path.slice(0, row.file_path.lastIndexOf('/'))
  const name = row.file_path.slice(row.file_path.lastIndexOf('/') + 1)
  const { data: listed } = await supabaseAdmin.storage.from('reports').list(dir, { search: name })
  if (!listed?.some(o => o.name === name)) {
    return NextResponse.json({ error: 'The file has not finished uploading' }, { status: 409 })
  }

  // Without an API key the report waits as 'queued' until its summary is written from Claude Code.
  const status = canAutoSummarise() ? 'processing' : 'queued'
  await supabaseAdmin.from('evaluation_reports')
    .update({ status, error: null, updated_at: new Date().toISOString() }).eq('id', id)

  if (status === 'processing') after(() => summariseEvaluation(id))
  return NextResponse.json({ status }, { status: 202 })
}
