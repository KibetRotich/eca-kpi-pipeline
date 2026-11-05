'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { FilterOptions } from '@/lib/eca-events/queries'

const lbl: React.CSSProperties = {
  fontSize: '.55rem', fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '.5px',
}
const sel: React.CSSProperties = { minWidth: 110, fontSize: '.7rem', padding: '.15rem .3rem' }

const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (ym: string) => MONTH_FMT.format(new Date(`${ym}-01T00:00:00Z`))

/** First and last day of a 'YYYY-MM' month — the from/to the queries filter on. */
function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

export default function FilterBar({ options }: { options: FilterOptions }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const get = (k: string) => sp.get(k) ?? ''

  function set(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v); else p.delete(k)
    }
    router.push(pathname + (p.toString() ? '?' + p.toString() : ''))
  }

  const country = get('country')
  const admin1 = get('admin1')
  const a1Opts = country ? (options.admin1ByCountry[country] ?? []) : []
  // The Month dropdown writes from/to as that month's first and last day; an older link with any other
  // from/to shows as "Custom dates" until a month is picked.
  const from = get('from'), to = get('to')
  const month = from ? from.slice(0, 7) : ''
  const isMonth = !!from && JSON.stringify(monthRange(month)) === JSON.stringify({ from, to })
  const monthValue = !from && !to ? '' : isMonth ? month : 'custom'

  const hasFilter = ['from', 'to', 'country', 'admin1', 'admin2', 'project', 'commodity',
    'eventType', 'trainingType', 'includeTest'].some(k => get(k))

  const Select = ({ k, label, opts, extra }:
    { k: string; label: string; opts: string[]; extra?: Record<string, string> }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={lbl}>{label}</span>
      <select style={sel} value={get(k)} onChange={e => set({ [k]: e.target.value, ...(extra ?? {}) })}>
        <option value="">All</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <div style={{
      background: '#fff', border: '1px solid #d0d0d0', padding: '.45rem .75rem',
      marginBottom: '.9rem', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '.5rem .9rem',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={lbl}>Month</span>
        <select style={sel} value={monthValue}
          onChange={e => set(e.target.value ? monthRange(e.target.value) : { from: '', to: '' })}>
          <option value="">All months</option>
          {monthValue === 'custom' && <option value="custom" disabled>Custom dates</option>}
          {options.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      {/* Cascade: changing country/admin1 clears the dependent level(s). */}
      <Select k="country" label="Country" opts={options.countries} extra={{ admin1: '', admin2: '' }} />
      <Select k="admin1" label="Admin 1" opts={a1Opts} />
      <Select k="project" label="Project" opts={options.projects} />
      <Select k="commodity" label="Commodity" opts={options.commodities} />

      {hasFilter && (
        <button className="btn-secondary" style={{ marginLeft: 'auto' }}
          onClick={() => router.push(pathname)}>Clear filters</button>
      )}
    </div>
  )
}
