'use client'

import { usePathname, useSearchParams } from 'next/navigation'

// Tab order = the dashboard priority order (management view).
const TABS = [
  { href: '/eca-events', label: 'Overview' },
  { href: '/eca-events/where-who', label: 'Where & Who' },
  { href: '/eca-events/delivery', label: 'What Was Delivered' },
  { href: '/eca-events/farmers', label: 'Farmer Depth' },
]
// M&E detail, kept out of the main tab row.
const DQ = { href: '/eca-events/data-quality', label: 'Data quality & notes →' }

export default function EcaNav() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString()
  const suffix = qs ? '?' + qs : ''   // carry the active filters across tabs

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '.25rem', marginBottom: '.8rem',
      borderBottom: '2px solid #FFC800', paddingBottom: '.4rem',
    }}>
      {TABS.map(t => {
        const active = pathname === t.href
        return (
          <a key={t.href} href={t.href + suffix} style={{
            fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
            padding: '.3rem .6rem', textDecoration: 'none', borderRadius: 3,
            background: active ? '#111' : '#f2f2f2', color: active ? '#FFC800' : '#555',
          }}>{t.label}</a>
        )
      })}
      <a href={DQ.href + suffix} style={{
        marginLeft: 'auto', alignSelf: 'center', fontSize: '.6rem', fontWeight: 600,
        color: pathname === DQ.href ? '#111' : '#888', textDecoration: pathname === DQ.href ? 'none' : 'underline',
      }}>{DQ.label}</a>
    </div>
  )
}
