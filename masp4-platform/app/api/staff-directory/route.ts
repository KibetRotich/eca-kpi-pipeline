/**
 * GET /api/staff-directory — @solidaridadnetwork.org staff for the report tracker's "Responsible" picker (Sprint 64).
 * Everyone in staff_directory (seeded from the tracker, plus addresses typed into the picker) and everyone who has
 * signed in to the platform (auth.users, read live). Google display names are preferred when both exist.
 * Requires a signed-in staff account. Returns [{ email, name }] sorted by name.
 */
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/require-staff'
import { isStaffEmail } from '@/lib/evaluations'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  const people = new Map<string, string>()
  const { data: dir, error } = await supabaseAdmin.from('staff_directory').select('email, name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  for (const d of dir ?? []) people.set(d.email, d.name)

  for (let page = 1; page < 20; page++) {
    const { data, error: e } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    for (const u of data.users) {
      const email = u.email?.toLowerCase()
      if (!email || !isStaffEmail(email)) continue
      const name = String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? '').trim()
      if (name) people.set(email, name)
      else if (!people.has(email)) people.set(email, email.split('@')[0])
    }
    if (data.users.length < 1000) break
  }

  const list = [...people].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json(list, { headers: { 'Cache-Control': 'private, no-store' } })
}
