'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import styles from './EcaNav.module.css'

// Page order = the dashboard priority order (management view); numbered like the
// static dashboards' left nav. Data quality & notes is the M&E detail page, last.
const PAGES = [
  { href: '/eca-events', label: 'Overview' },
  { href: '/eca-events/where-who', label: 'Where & Who' },
  { href: '/eca-events/delivery', label: 'What Was Delivered' },
  { href: '/eca-events/farmers', label: 'Farmer Depth' },
  { href: '/eca-events/data-quality', label: 'Data quality & notes' },
]

export default function EcaNav() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const qs = sp.toString()
  const suffix = qs ? '?' + qs : ''   // carry the active filters across pages

  return (
    <nav className={styles.nav}>
      {PAGES.map((p, i) => (
        <a key={p.href} href={p.href + suffix} className={pathname === p.href ? styles.active : undefined}>
          {i + 1} · {p.label}
        </a>
      ))}
    </nav>
  )
}
