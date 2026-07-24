'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { FilterOptions } from '@/lib/eca-events/queries'

const lbl: React.CSSProperties = {
  fontSize: '.55rem', fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '.5px',
}
const sel: React.CSSProperties = { minWidth: 110, fontSize: '.7rem', padding: '.15rem .3rem' }

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
  const a2Opts = admin1 ? (options.admin2ByAdmin1[admin1] ?? []) : []
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
        <span style={lbl}>From</span>
        <input type="date" style={sel} value={get('from')} min={options.dateMin ?? undefined}
          max={options.dateMax ?? undefined} onChange={e => set({ from: e.target.value })} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={lbl}>To</span>
        <input type="date" style={sel} value={get('to')} min={options.dateMin ?? undefined}
          max={options.dateMax ?? undefined} onChange={e => set({ to: e.target.value })} />
      </div>
      {/* Cascade: changing country/admin1 clears the dependent level(s). */}
      <Select k="country" label="Country" opts={options.countries} extra={{ admin1: '', admin2: '' }} />
      <Select k="admin1" label="Admin 1" opts={a1Opts} extra={{ admin2: '' }} />
      <Select k="admin2" label="Admin 2" opts={a2Opts} />
      <Select k="project" label="Project" opts={options.projects} />
      <Select k="commodity" label="Commodity" opts={options.commodities} />
      <Select k="eventType" label="Event type" opts={options.eventTypes} />
      <Select k="trainingType" label="Training type" opts={options.trainingTypes} />

      <label style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.62rem', color: '#555', fontWeight: 600 }}>
        <input type="checkbox" checked={get('includeTest') === '1'}
          onChange={e => set({ includeTest: e.target.checked ? '1' : '' })} />
        Include test records
      </label>

      {hasFilter && (
        <button className="btn-secondary" style={{ marginLeft: 'auto' }}
          onClick={() => router.push(pathname)}>Clear filters</button>
      )}
    </div>
  )
}
