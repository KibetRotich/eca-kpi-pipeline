/**
 * /api/framework — per-project Measurement Framework (Sprint 28)
 *
 * GET    ?project_id=<uuid>
 *        → { indicators: [...], values: [...] }   (read: anyone, like the other Targets APIs)
 * POST   { action: 'indicator', project_id, id?, indicator_code, level, indicator, unit,
 *          baseline, end_target, annual_targets, cumulative, sort_order }   → upsert an indicator
 * POST   { action: 'value', indicator_id, period_end: 'YYYY-06'|'YYYY-12',
 *          total, female, male, youth, notes }                              → upsert a 6-monthly value
 * DELETE ?indicator_id=<uuid>  (removes the indicator and its values)
 * DELETE ?value_id=<uuid>
 *
 * Writes require an M&E Officer or Admin session (requireEditor).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireEditor } from '@/lib/require-editor'
import { NextRequest, NextResponse } from 'next/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERIOD = /^\d{4}-(06|12)$/
const LEVELS = ['Goal', 'Outcome', 'Output']

/** '' / null / undefined → null; otherwise a non-negative number, or an error string. */
function num(v: unknown, field: string): number | null | string {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return `${field} must be a number ≥ 0`
  return n
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id') ?? ''
  if (!UUID.test(projectId)) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const ind = await supabaseAdmin
    .from('project_mf_indicators')
    .select('id, indicator_code, level, indicator, unit, baseline, end_target, annual_targets, cumulative, sort_order, source, updated_at')
    .eq('project_id', projectId)
    .order('sort_order').order('indicator_code')
  if (ind.error) return NextResponse.json({ error: ind.error.message }, { status: 500 })

  const ids = (ind.data ?? []).map(i => i.id)
  let values: any[] = []
  if (ids.length) {
    const val = await supabaseAdmin
      .from('project_mf_values')
      .select('id, indicator_id, period_end, total, female, male, youth, notes, updated_at')
      .in('indicator_id', ids)
      .order('period_end')
    if (val.error) return NextResponse.json({ error: val.error.message }, { status: 500 })
    values = val.data ?? []
  }
  // Google-Sheet framework linked to this project (Sprints 29 / 31) — shown like Seedlings tab 8.
  // source_table 'save_mf_indicator_values' = SAVE (KE-SVP-001); 'project_mf_sheet_values' = any
  // other project, loaded nightly by pipeline/frameworks/sync_framework_sheets.py.
  let sheet: any = null
  const link = await supabaseAdmin.from('project_mf_sheets')
    .select('sheet_id, gid, tab, source_table, label, cadence, extras, last_synced_at, county_tabs').eq('project_id', projectId).maybeSingle()
  if (link.data) {
    const extras: string[] = link.data.extras ?? []
    const cols = 'indicator_id, period_end, level, indicator, unit, baseline, end_target, cumulative, total, male, female, youth, survival_pct, note, period_label, network_kpi'
    const rowsQ = link.data.source_table === 'save_mf_indicator_values'
      ? supabaseAdmin.from('save_mf_indicator_values').select(cols)
      : supabaseAdmin.from('project_mf_sheet_values').select(cols + ', target_direct, non_individual, eop_total, eop_male, eop_female, eop_youth, overall_total').eq('project_id', projectId)
    const countyTabs: string[] = link.data.county_tabs ?? []
    const [rows, meta, dist, reached, counties] = await Promise.all([
      rowsQ.order('indicator_id').order('period_end'),
      link.data.source_table === 'save_mf_indicator_values'
        ? supabaseAdmin.from('save_dist_sync_meta').select('framework_synced_at').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: { framework_synced_at: link.data.last_synced_at } }),
      extras.includes('save_kobo_reference')
        ? supabaseAdmin.from('v_save_dist_seedlings_by_period').select('period_end, seedlings_distributed_cum').order('period_end')
        : Promise.resolve({ data: null }),
      extras.includes('save_reached')
        ? supabaseAdmin.from('v_save_dist_reached_gender_youth').select('*').maybeSingle()
        : Promise.resolve({ data: null }),
      // per-county yearly achievements (Sprint 32) — IPTT county tabs
      countyTabs.length
        ? supabaseAdmin.from('project_mf_sheet_county_values')
            .select('county, indicator_id, period_end, total, male, female, youth, non_individual')
            .eq('project_id', projectId).order('county').order('indicator_id').order('period_end')
        : Promise.resolve({ data: null }),
    ])
    if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 })
    sheet = {
      sheet_id: link.data.sheet_id, gid: link.data.gid, tab: link.data.tab, label: link.data.label,
      cadence: link.data.cadence ?? '6-monthly',
      synced_at: (meta.data as any)?.framework_synced_at ?? null,
      rows: rows.data ?? [],
      // SAVE only: "trees planted" cross-check with seedlings handed out on the Kobo distribution form
      reference: dist.data ? { indicator_id: 'SAVE-01', label: 'seedlings distributed (Kobo form, cumulative)',
                   series: (dist.data as any[]).map(d => ({ period_end: d.period_end, value: Number(d.seedlings_distributed_cum) })) } : undefined,
      // SAVE only: gender / youth of farmers reached (profiled register x distributions) — Sprint 30
      reached: reached.data ?? null,
      county_order: countyTabs,
      counties: counties.data ?? [],
    }
  }

  return NextResponse.json({ indicators: ind.data ?? [], values, sheet })
}

export async function POST(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const now = new Date().toISOString()

  if (body.action === 'indicator') {
    if (!UUID.test(body.project_id ?? '')) return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    const code = String(body.indicator_code ?? '').trim()
    const name = String(body.indicator ?? '').trim()
    if (!code || !name) return NextResponse.json({ error: 'Indicator code and indicator name are required' }, { status: 400 })
    if (body.level && !LEVELS.includes(body.level)) return NextResponse.json({ error: 'Level must be Goal, Outcome or Output' }, { status: 400 })
    const baseline = num(body.baseline, 'Baseline'), end_target = num(body.end_target, 'End target')
    for (const v of [baseline, end_target]) if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 })

    // annual_targets: { "2026": { total, female?, male? } } — keep only well-formed, non-empty years
    const annual: Record<string, Record<string, number>> = {}
    for (const [yr, t] of Object.entries(body.annual_targets ?? {})) {
      if (!/^\d{4}$/.test(yr) || typeof t !== 'object' || t === null) continue
      const row: Record<string, number> = {}
      for (const k of ['total', 'female', 'male']) {
        const v = num((t as any)[k], `${yr} ${k} target`)
        if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 })
        if (v !== null) row[k] = v
      }
      if (row.total !== undefined) annual[yr] = row
    }

    const row: Record<string, unknown> = {
      project_id: body.project_id, indicator_code: code, indicator: name,
      level: body.level || null, unit: String(body.unit ?? '').trim() || null,
      baseline, end_target, annual_targets: annual,
      cumulative: body.cumulative === true ? true : body.cumulative === false ? false : null,
      sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 100,
      updated_at: now,
    }
    const q = body.id && UUID.test(body.id)
      ? supabaseAdmin.from('project_mf_indicators').update(row).eq('id', body.id).select('id').single()
      : supabaseAdmin.from('project_mf_indicators').insert({ ...row, source: 'entered on Targets page' }).select('id').single()
    const { data, error } = await q
    if (error) {
      const dup = error.code === '23505'
      return NextResponse.json({ error: dup ? `Indicator code "${code}" already exists in this project` : error.message }, { status: dup ? 409 : 500 })
    }
    return NextResponse.json({ ok: true, id: data?.id })
  }

  if (body.action === 'value') {
    if (!UUID.test(body.indicator_id ?? '')) return NextResponse.json({ error: 'indicator_id required' }, { status: 400 })
    if (!PERIOD.test(body.period_end ?? '')) return NextResponse.json({ error: 'period_end must be YYYY-06 or YYYY-12' }, { status: 400 })
    const vals: Record<string, number | null> = {}
    for (const k of ['total', 'female', 'male', 'youth']) {
      const v = num(body[k], k[0].toUpperCase() + k.slice(1))
      if (typeof v === 'string') return NextResponse.json({ error: v }, { status: 400 })
      vals[k] = v
    }
    if (vals.total === null) return NextResponse.json({ error: 'Total is required' }, { status: 400 })
    if ((vals.female ?? 0) + (vals.male ?? 0) > (vals.total as number))
      return NextResponse.json({ error: 'Female + male cannot be more than the total' }, { status: 400 })
    if ((vals.youth ?? 0) > (vals.total as number))
      return NextResponse.json({ error: 'Youth cannot be more than the total' }, { status: 400 })

    const { error } = await supabaseAdmin.from('project_mf_values').upsert({
      indicator_id: body.indicator_id, period_end: body.period_end, ...vals,
      notes: String(body.notes ?? '').trim() || null, updated_at: now,
    }, { onConflict: 'indicator_id,period_end' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "action must be 'indicator' or 'value'" }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const authErr = await requireEditor(req)
  if (authErr) return authErr

  const sp = req.nextUrl.searchParams
  const indicatorId = sp.get('indicator_id'), valueId = sp.get('value_id')
  const [table, id] = indicatorId ? ['project_mf_indicators', indicatorId] : ['project_mf_values', valueId]
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'indicator_id or value_id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from(table as string).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
