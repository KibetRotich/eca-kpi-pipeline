'use client'

import { usePathname, useSearchParams } from 'next/navigation'

// Tab order = the dashboard priority order.
const TABS = [
  { href: '/eca-events', label: 'Overview' },
  { href: '/eca-events/geography', label: 'Geography' },
  { href: '/eca-events/gender-youth', label: 'Gender & Youth' },
  { href: '/eca-events/projects', label: 'Projects & Commodities' },
  { href: '/eca-events/curriculum', label: 'Curriculum' },
  { href: '/eca-events/beneficiaries', label: 'Beneficiaries' },
  { href: '/eca-events/facilitators', label: 'Facilitators' },
  { href: '/eca-events/farmers', label: 'Farmer Depth' },
  { href: '/eca-events/data-quality', label: 'Data Quality' },
  { href: '/eca-events/time-planning', label: 'Time & Planning' },
  { href: '/eca-events/dictionary', label: 'Data Dictionary' },
]

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
    </div>
  )
}
