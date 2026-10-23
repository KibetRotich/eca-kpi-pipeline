/**
 * /api/themes — Thematic Insights (Sprint 49)
 *
 * GET ?scope=review → every DRAFT theme synthesis, with its theme and the published studies it cites
 *     ({ drafts: [...], studies: { <id>: SourceStudy } }). Requires an M&E Officer or Admin.
 *     Drafts are written from a Claude Code session ("synthesise themes"); there is no create endpoint.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { NextRequest, NextResponse } from 'next/server'

type DraftRow = { source_report_ids: string[]; evaluation_themes: { sort_order: number } | null }

export async function GET(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff
  if (!staff.canEdit) return NextResponse.json({ error: 'M&E Officer or Admin access required' }, { status: 403 })
  if (req.nextUrl.searchParams.get('scope') !== 'review') {
    return NextResponse.json({ error: 'scope=review is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('theme_insights')
    .select('id, theme_key, status, synthesis, evidence_rating, source_report_ids, review_note, generated_at, ' +
            'published_at, evaluation_themes(title, sort_order)')
    .eq('status', 'draft')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const drafts = (data ?? []) as unknown as DraftRow[]

  const ids = [...new Set(drafts.flatMap(d => d.source_report_ids))]
  const { data: studies } = ids.length
    ? await supabaseAdmin.from('evaluation_reports')
        .select('id, title, programme, country, tags, period_start, period_end')
        .in('id', ids).eq('status', 'published')
    : { data: [] }

  return NextResponse.json({
    drafts: drafts.sort((a, b) => (a.evaluation_themes?.sort_order ?? 0) - (b.evaluation_themes?.sort_order ?? 0)),
    studies: Object.fromEntries((studies ?? []).map(s => [s.id, s])),
  })
}
