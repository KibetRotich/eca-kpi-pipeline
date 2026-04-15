/**
 * /api/projects — list all active projects (used by enrollment UI)
 */

import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, project_code, project_name, country, commodity')
    .eq('active', true)
    .order('country')
    .order('project_code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
