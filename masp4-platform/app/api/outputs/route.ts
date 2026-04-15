/**
 * /api/outputs
 * GET  ?year=2026[&country=Kenya][&commodity=Coffee]
 *      → { outputMap: { "proj_code": { q1, q2, q3, q4, annual, female, male, youth } } }
 * POST — upsert one quarterly output record
 * DELETE ?id=...
 */

import { supabaseAdmin } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams
  const year      = sp.get('year')      ?? '2026'
  const country   = sp.get('country')   ?? ''
  const commodity = sp.get('commodity') ?? ''

  let q = supabaseAdmin
    .from('project_output_records')
    .select('id, survey_year, quarter, farmers_trained, female_count, male_count, youth_count, channel_notes, notes, project_id, projects!inner(project_code, country, commodity)')
    .eq('survey_year', year)

  if (country)   q = (q as any).eq('projects.country',   country)
  if (commodity) q = (q as any).eq('projects.commodity', commodity)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Index by project_code → { q1, q2, q3, q4, annual, female, male, youth, rows[] }
  const outputMap: Record<string, any> = {}
  for (const row of data ?? []) {
    const proj = (row.projects as any)
    const code = proj?.project_code
    if (!code) continue
    if (!outputMap[code]) {
      outputMap[code] = { q1: null, q2: null, q3: null, q4: null, annual: 0, female: 0, male: 0, youth: 0, rows: [] }
    }
    const entry = outputMap[code]
    entry[`q${row.quarter}`] = {
      id:             row.id,
      farmers_trained: row.farmers_trained,
      female_count:   row.female_count,
      male_count:     row.male_count,
      youth_count:    row.youth_count,
      channel_notes:  row.channel_notes,
      notes:          row.notes,
    }
    entry.annual  += Number(row.farmers_trained) || 0
    entry.female  += Number(row.female_count)    || 0
    entry.male    += Number(row.male_count)      || 0
    entry.youth   += Number(row.youth_count)     || 0
    entry.rows.push(row)
  }

  return NextResponse.json({ outputMap, year })
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { project_id, survey_year, quarter, farmers_trained, female_count, male_count, youth_count, channel_notes, notes } = body

  if (!project_id)    return NextResponse.json({ error: 'project_id required' },    { status: 400 })
  if (!survey_year)   return NextResponse.json({ error: 'survey_year required' },   { status: 400 })
  if (!quarter || quarter < 1 || quarter > 4)
    return NextResponse.json({ error: 'quarter must be 1–4' }, { status: 400 })
  if (farmers_trained == null || farmers_trained < 0)
    return NextResponse.json({ error: 'farmers_trained must be ≥ 0' }, { status: 400 })

  const payload: any = {
    project_id,
    survey_year:     Number(survey_year),
    quarter:         Number(quarter),
    farmers_trained: Number(farmers_trained),
    channel_notes:   channel_notes || null,
    notes:           notes         || null,
  }
  if (female_count != null && female_count !== '') payload.female_count = Number(female_count) || null
  if (male_count   != null && male_count   !== '') payload.male_count   = Number(male_count)   || null
  if (youth_count  != null && youth_count  !== '') payload.youth_count  = Number(youth_count)  || null

  const { data, error } = await supabaseAdmin
    .from('project_output_records')
    .upsert(payload, { onConflict: 'project_id,survey_year,quarter' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabaseAdmin.from('project_output_records').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
