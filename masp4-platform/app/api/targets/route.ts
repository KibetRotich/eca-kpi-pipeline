/**
 * /api/targets
 * GET  ?year=2026  — per-KPI targets + achievements for all projects in a year
 * POST             — upsert one KPI target row
 * DELETE ?id=...   — remove a KPI target row
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireEditor } from '@/lib/require-editor'
import { NextRequest, NextResponse } from 'next/server'

const KPI_CODES = ['S6.1','S6.2','S2.1','S2.5','S6.3','S6.4','S6.5','OUT.1','REC01','REC02','REC03','REC04','REC05'] as const

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year') ?? '2026'

  const [targetsRes, summaryRes] = await Promise.all([
    supabaseAdmin
      .from('project_kpi_targets')
      .select('id, survey_year, kpi_code, target_total, target_female, target_male, notes, updated_at, projects(id, project_code)')
      .eq('survey_year', year),

    supabaseAdmin
      .from('v_kpi_summary')
      .select('project_code, survey_year, s61_count, s62_count, s21_count, s25_count, s63_count, s64_companies, s65_companies')
      .eq('survey_year', year),
  ])

  if (targetsRes.error) return NextResponse.json({ error: targetsRes.error.message }, { status: 500 })

  // Index targets by "project_id:kpi_code"
  const targetMap: Record<string, any> = {}
  for (const row of targetsRes.data ?? []) {
    const proj = (row.projects as any)
    const key  = `${proj?.project_code}:${row.kpi_code}`
    targetMap[key] = row
  }

  // Index achievements by "project_code:kpi_code"
  const achMap: Record<string, number> = {}
  for (const row of summaryRes.data ?? []) {
    achMap[`${row.project_code}:S6.1`] = Number(row.s61_count)    || 0
    achMap[`${row.project_code}:S6.2`] = Number(row.s62_count)    || 0
    achMap[`${row.project_code}:S2.1`] = Number(row.s21_count)    || 0
    achMap[`${row.project_code}:S2.5`] = Number(row.s25_count)    || 0
    achMap[`${row.project_code}:S6.3`] = Number(row.s63_count)    || 0
    achMap[`${row.project_code}:S6.4`] = Number(row.s64_companies)|| 0
    achMap[`${row.project_code}:S6.5`] = Number(row.s65_companies)|| 0
  }

  return NextResponse.json({ targetMap, achMap, year })
}

export async function POST(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, survey_year, kpi_code, target_total, target_female, target_male, notes } = body
  if (!project_id)  return NextResponse.json({ error: 'project_id required' },  { status: 400 })
  if (!survey_year) return NextResponse.json({ error: 'survey_year required' }, { status: 400 })
  if (!kpi_code || !KPI_CODES.includes(kpi_code))
    return NextResponse.json({ error: `kpi_code must be one of ${KPI_CODES.join(', ')}` }, { status: 400 })
  if (!target_total || target_total <= 0)
    return NextResponse.json({ error: 'target_total must be > 0' }, { status: 400 })

  const payload: any = { project_id, survey_year, kpi_code, target_total, notes: notes || null }
  if (target_female !== undefined && target_female !== '') payload.target_female = Number(target_female) || null
  if (target_male   !== undefined && target_male   !== '') payload.target_male   = Number(target_male)   || null

  const { data, error } = await supabaseAdmin
    .from('project_kpi_targets')
    .upsert(payload, { onConflict: 'project_id,survey_year,kpi_code' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('project_kpi_targets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
