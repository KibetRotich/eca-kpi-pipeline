/**
 * GET /api/submissions
 *
 * Returns the review queue. Query params:
 *   status  — pending | approved | rejected | needs_review  (default: pending)
 *   country — filter by country
 *   form_id — filter by form type
 *   page    — 1-based (default: 1)
 *   per_page — default 50, max 200
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status   = searchParams.get('status')   ?? 'pending'
  const country  = searchParams.get('country')
  const formId   = searchParams.get('form_id')
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage  = Math.min(200, parseInt(searchParams.get('per_page') ?? '50', 10))

  let query = supabaseAdmin
    .from('odk_submissions')
    .select(`
      id,
      submission_uuid,
      form_id,
      country,
      submitted_at,
      imported_at,
      status,
      review_notes,
      raw_data->_survey_year,
      projects ( project_code, project_name, country, commodity )
    `, { count: 'exact' })
    .eq('status', status)
    .order('submitted_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (country) query = query.eq('country', country)
  if (formId)  query = query.eq('form_id', formId)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    total: count ?? 0,
    page,
    per_page: perPage,
    submissions: data ?? [],
  })
}
