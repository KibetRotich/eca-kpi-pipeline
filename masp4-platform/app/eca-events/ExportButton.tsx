'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser as supabase } from '@/lib/supabase-browser'
import { parseFilters, EQ_COLUMNS } from '@/lib/eca-events/filters'

const PAGE = 1000

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

export default function ExportButton() {
  const sp = useSearchParams()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const f = parseFilters(Object.fromEntries(sp.entries()))
      const rows: any[] = []
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from('v_eca_events_safe').select('*').range(from, from + PAGE - 1)
        if (!f.includeTest) q = q.eq('is_real', true)
        for (const [k, col] of EQ_COLUMNS) if ((f as any)[k]) q = q.eq(col, (f as any)[k])
        if (f.from) q = q.gte('training_date', f.from)
        if (f.to) q = q.lte('training_date', f.to)
        const { data, error } = await q
        if (error) throw error
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `eca-events_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn-secondary" onClick={run} disabled={busy}
      title="Download the currently-filtered events (PII-free) as CSV">
      {busy ? 'Exporting…' : '⬇ Export CSV'}
    </button>
  )
}
