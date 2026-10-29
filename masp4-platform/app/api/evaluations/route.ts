/**
 * /api/evaluations — Evaluation Insights reports (Sprint 47)
 *
 * POST { title, project_id, programme, country, period_start, period_end, tags[], commodities[], file_name, file_type, file_size }
 *      → creates the report record (status 'uploading') and returns a one-time signed upload URL
 *        { id, path, token } for the private `reports` bucket. The browser uploads the file straight
 *        to storage (Vercel caps request bodies at 4.5 MB), then calls POST /api/evaluations/<id>/process.
 *      Requires a signed-in @solidaridadnetwork.org account (requireStaff).
 *
 * GET  ?scope=review → every report not yet published (awaiting summary, drafts, failures, in progress),
 *      newest first.
 *      Requires an M&E Officer or Admin.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { EVAL_COMMODITIES, EVAL_COUNTRIES, EVAL_TAGS, MAX_REPORT_BYTES, PROGRAMME_OTHER, REPORT_TYPES } from '@/lib/evaluations'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

const LIST_COLS = 'id, title, programme, country, period_start, period_end, tags, commodities, file_name, file_type, source_url, ' +
                  'evaluator, uploaded_by, uploaded_at, status, summary, error, review_note, published_at'

/** Keeps the original name readable while making it safe as a storage object key. */
function safeFileName(name: string, ext: string) {
  const base = name.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80)
  return `${base || 'report'}.${ext}`
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const title = String(b.title ?? '').trim()
  const programme = String(b.programme ?? '').trim()
  const country = String(b.country ?? '')
  const projectId = b.project_id ? String(b.project_id) : null
  const start = b.period_start ? String(b.period_start) : null
  const end = b.period_end ? String(b.period_end) : null
  const tags = Array.isArray(b.tags) ? b.tags.map(String) : []
  const commodities = Array.isArray(b.commodities) ? b.commodities.map(String) : []
  const fileName = String(b.file_name ?? '')
  const fileType = REPORT_TYPES[String(b.file_type ?? '')]
  const fileSize = Number(b.file_size)

  if (title.length < 3 || title.length > 300) return NextResponse.json({ error: 'Report Title must be 3–300 characters' }, { status: 400 })
  if (!programme) return NextResponse.json({ error: 'Programme is required' }, { status: 400 })
  if (projectId && !UUID.test(projectId)) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  if (!(EVAL_COUNTRIES as readonly string[]).includes(country)) return NextResponse.json({ error: 'Country is required' }, { status: 400 })
  if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return NextResponse.json({ error: 'Invalid evaluation period' }, { status: 400 })
  if (start && end && start > end) return NextResponse.json({ error: 'The evaluation period ends before it starts' }, { status: 400 })
  if (tags.some(t => !(EVAL_TAGS as readonly string[]).includes(t))) return NextResponse.json({ error: 'Unknown tag' }, { status: 400 })
  if (commodities.some(c => !(EVAL_COMMODITIES as readonly string[]).includes(c))) return NextResponse.json({ error: 'Unknown commodity' }, { status: 400 })
  if (!fileType || !fileName.toLowerCase().endsWith(`.${fileType}`)) {
    return NextResponse.json({ error: 'Only .pdf and .docx files can be uploaded' }, { status: 400 })
  }
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: 'The file must be smaller than 25 MB' }, { status: 400 })
  }

  let programmeName = programme
  if (projectId) {
    const { data: p } = await supabaseAdmin.from('projects').select('project_name').eq('id', projectId).single()
    if (!p) return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
    programmeName = p.project_name
  } else if (programme !== PROGRAMME_OTHER) {
    return NextResponse.json({ error: 'Unknown programme' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const path = `evaluations/${id}/${safeFileName(fileName, fileType)}`

  const { error: insErr } = await supabaseAdmin.from('evaluation_reports').insert({
    id, title, project_id: projectId, programme: programmeName, country,
    period_start: start, period_end: end, tags: [...new Set(tags)], commodities: [...new Set(commodities)],
    file_path: path, file_name: fileName.slice(0, 200), file_type: fileType, file_size: fileSize,
    uploaded_by: staff.email, status: 'uploading',
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const { data: signed, error: signErr } = await supabaseAdmin.storage.from('reports').createSignedUploadUrl(path)
  if (signErr || !signed) {
    await supabaseAdmin.from('evaluation_reports').delete().eq('id', id)
    return NextResponse.json({ error: 'Could not prepare the upload — please try again' }, { status: 500 })
  }

  return NextResponse.json({ id, path: signed.path, token: signed.token }, { status: 201 })
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('scope') !== 'review') {
    return NextResponse.json({ error: 'scope=review required' }, { status: 400 })
  }
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })

  const { data, error } = await supabaseAdmin.from('evaluation_reports')
    .select(LIST_COLS)
    .in('status', ['uploading', 'queued', 'processing', 'draft', 'failed'])
    .order('uploaded_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
