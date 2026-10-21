/**
 * GET /api/evaluations/<id>/file — download the full report.
 *
 * Signed-in staff only: redirects to a 2-minute signed URL for the private `reports` bucket, or to the
 * report in Google Drive for studies linked from Drive (Drive's own sharing then applies).
 * Unpublished reports are available only to their uploader and to M&E Officers / Admins.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: row } = await supabaseAdmin.from('evaluation_reports')
    .select('status, uploaded_by, file_path, file_name, source_url').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status !== 'published' && row.uploaded_by !== staff.email && !staff.canEdit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!row.file_path) {
    return row.source_url ? NextResponse.redirect(row.source_url, 302)
                          : NextResponse.json({ error: 'The file could not be retrieved' }, { status: 404 })
  }
  const { data, error } = await supabaseAdmin.storage.from('reports')
    .createSignedUrl(row.file_path, 120, { download: row.file_name })
  if (error || !data) return NextResponse.json({ error: 'The file could not be retrieved' }, { status: 500 })
  return NextResponse.redirect(data.signedUrl, 302)
}
