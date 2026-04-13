/**
 * POST /api/submissions/[id]/reject
 *
 * Body: { reviewer_id?: string, notes: string }
 * Sets status → 'rejected'. No normalisation is performed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body       = await req.json().catch(() => ({}))
  const reviewerId = body.reviewer_id as string | undefined
  const notes      = body.notes       as string | undefined

  if (!notes) {
    return NextResponse.json({ error: 'A rejection note is required.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('odk_submissions')
    .update({
      status:       'rejected',
      reviewed_by:  reviewerId ?? null,
      reviewed_at:  new Date().toISOString(),
      review_notes: notes,
    })
    .eq('id', id)
    .neq('status', 'approved') // cannot reject an already-approved submission

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rejected: true })
}
