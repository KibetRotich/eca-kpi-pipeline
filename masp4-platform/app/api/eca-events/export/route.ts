/**
 * /api/eca-events/export — the currently-filtered ECA events as CSV (PII-free v_eca_events_safe).
 *
 * GET ?<the /eca-events filter params> → text/csv. Staff only (requireStaff).
 * Read server-side with the service role (Sprint 59): signed-in users no longer read the
 * SECURITY DEFINER views directly through the database API.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/require-staff'
import { parseFilters } from '@/lib/eca-events/filters'
import { getEventsForExport } from '@/lib/eca-events/queries'

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff(req)
  if (staff instanceof NextResponse) return staff

  try {
    const rows = await getEventsForExport(parseFilters(Object.fromEntries(req.nextUrl.searchParams.entries())))
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="eca-events_${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
