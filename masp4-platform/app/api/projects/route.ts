/**
 * /api/projects — list all active projects (used by enrollment UI and /targets)
 * has_framework = the project has a measurement framework linked (project_mf_sheets).
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
  const links = await supabaseAdmin.from('project_mf_sheets').select('project_id')
  const linked = new Set((links.data ?? []).map(l => l.project_id))
  return NextResponse.json((data ?? []).map(p => ({ ...p, has_framework: linked.has(p.id) })))
}
