/**
 * /api/rec
 * GET  ?year=2026  → { recMap: { "PROJ_CODE:REC01": 5 }, recIdMap: { "PROJ_CODE:REC01": "uuid" } }
 * POST             → upsert one REC record (project_id, survey_year, rec_code, count)
 * DELETE ?id=...   → remove a REC record
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireEditor } from '@/lib/require-editor'
import { NextRequest, NextResponse } from 'next/server'

const REC_CODES = ['REC01','REC02','REC03','REC04','REC05'] as const

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year') ?? '2026'

  const { data, error } = await supabaseAdmin
    .from('project_rec_records')
    .select('id, survey_year, rec_code, count, notes, projects(project_code)')
    .eq('survey_year', year)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const recMap:   Record<string, number> = {}
  const recIdMap: Record<string, string> = {}

  for (const row of data ?? []) {
    const code = (row.projects as any)?.project_code
    if (!code) continue
    const key = `${code}:${row.rec_code}`
    recMap[key]   = Number(row.count) || 0
    recIdMap[key] = row.id
  }

  return NextResponse.json({ recMap, recIdMap, year })
}

export async function POST(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, survey_year, rec_code, count, notes } = body
  if (!project_id)  return NextResponse.json({ error: 'project_id required' },  { status: 400 })
  if (!survey_year) return NextResponse.json({ error: 'survey_year required' }, { status: 400 })
  if (!rec_code || !REC_CODES.includes(rec_code))
    return NextResponse.json({ error: `rec_code must be one of ${REC_CODES.join(', ')}` }, { status: 400 })
  if (count == null || count < 0)
    return NextResponse.json({ error: 'count must be ≥ 0' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('project_rec_records')
    .upsert({
      project_id,
      survey_year: Number(survey_year),
      rec_code,
      count:       Number(count),
      notes:       notes || null,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,survey_year,rec_code' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('project_rec_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
