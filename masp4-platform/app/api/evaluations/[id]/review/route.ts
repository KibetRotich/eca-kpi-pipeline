/**
 * POST /api/evaluations/<id>/review { action } — M&E Officer / Admin review of an AI summary.
 *
 *   publish  draft → published   (appears on /evaluation-insights)
 *   reject   draft | failed | uploading → rejected   (kept, never shown)
 *   retry    draft | failed | uploading → processing (re-runs the summarisation pipeline; a report stuck
 *            in 'uploading' — browser closed before processing started — is recovered this way)
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { summariseEvaluation } from '@/lib/summarise-evaluation'
import { after, NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_FROM: Record<string, string[]> = {
  publish: ['draft'],
  reject:  ['draft', 'failed', 'uploading'],
  retry:   ['draft', 'failed', 'uploading'],
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let action = ''
  try { action = String((await req.json()).action ?? '') } catch { /* handled below */ }
  if (!ALLOWED_FROM[action]) return NextResponse.json({ error: 'action must be publish, reject or retry' }, { status: 400 })

  const { data: row } = await supabaseAdmin.from('evaluation_reports').select('status').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!ALLOWED_FROM[action].includes(row.status)) {
    return NextResponse.json({ error: `A ${row.status} report cannot be ${action === 'retry' ? 'retried' : action + 'ed'}` }, { status: 409 })
  }

  const now = new Date().toISOString()
  const update =
    action === 'publish' ? { status: 'published', reviewed_by: staff.email, reviewed_at: now, published_at: now, updated_at: now } :
    action === 'reject'  ? { status: 'rejected',  reviewed_by: staff.email, reviewed_at: now, updated_at: now } :
                           { status: 'processing', error: null, updated_at: now }

  const { error } = await supabaseAdmin.from('evaluation_reports').update(update).eq('id', id).eq('status', row.status)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action === 'retry') after(() => summariseEvaluation(id))
  return NextResponse.json({ status: update.status })
}
