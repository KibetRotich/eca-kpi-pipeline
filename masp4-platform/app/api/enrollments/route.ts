/**
 * /api/enrollments
 * GET  — list all enrollments joined with project info
 * POST — upsert enrollment figures for a project × year
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireEditor } from '@/lib/require-editor'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('project_year_enrollments')
    .select(`
      id, survey_year,
      enrolled_total, enrolled_female, enrolled_male,
      data_source, notes, updated_at,
      projects ( id, project_code, project_name, country, commodity )
    `)
    .order('survey_year')
    .order('projects(project_code)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, survey_year, enrolled_total, enrolled_female, enrolled_male, data_source, notes } = body

  if (!project_id)    return NextResponse.json({ error: 'project_id required' }, { status: 400 })
  if (!survey_year)   return NextResponse.json({ error: 'survey_year required' }, { status: 400 })
  if (!enrolled_total || enrolled_total <= 0)
    return NextResponse.json({ error: 'enrolled_total must be > 0' }, { status: 400 })

  const payload: any = { project_id, survey_year, enrolled_total, data_source, notes }
  if (enrolled_female !== undefined && enrolled_female !== '') payload.enrolled_female = Number(enrolled_female) || null
  if (enrolled_male   !== undefined && enrolled_male   !== '') payload.enrolled_male   = Number(enrolled_male)   || null

  const { data, error } = await supabaseAdmin
    .from('project_year_enrollments')
    .upsert(payload, { onConflict: 'project_id,survey_year' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 200 })
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('project_year_enrollments')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
