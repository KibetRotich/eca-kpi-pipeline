'use client'

/**
 * Platform nav bar. Every section opens in the same window (client-side navigation via next/link, so the
 * header and sign-in state are not reloaded), and the section you are in is highlighted.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'

const TABS = [
  { href: '/targets',      label: "Projects' Progress"      },
  { href: '/dashboard',    label: 'Network KPIs'            },
  { href: '/instructions', label: 'Network KPI Measurement' },
]

/** Coloured section buttons on the right. `also` = other routes that belong to the section. */
const PILLS: { href: string; label: string; bg: string; fg: string; also?: string[] }[] = [
  // Granular Data — Output Insights hub of Kobo-form analytics; ECA Events is one of its dashboards
  { href: '/output-insights',     label: 'Granular Data',       bg: '#2e7d32', fg: '#fff', also: ['/eca-events'] },
  // Evaluation Insights — key insights from studies carried out by projects
  { href: '/evaluation-insights', label: 'Evaluation Insights', bg: '#1565c0', fg: '#fff' },
  // Thematic Insights — cross-study syntheses by theme (replaced the MASP III Dashboard tab, Sprint 49)
  { href: '/thematic-insights',   label: 'Thematic Insights',   bg: '#FFC800', fg: '#000' },
  // Annual Reports — tracker + library of donor and country annual reports (Sprints 61–62)
  { href: '/annual-reports',      label: 'Annual Reports',      bg: '#be123c', fg: '#fff' },
]

const within = (path: string, href: string) => path === href || path.startsWith(href + '/')

const pill = (bg: string, fg: string, active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '.4rem',
  background: bg,
  color: fg,
  fontSize: '.62rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  padding: '0 .9rem',
  height: 26,
  borderRadius: 4,
  textDecoration: 'none',
  // Active section: a ring in the button's own colour (the white gap keeps it visible on the yellow one).
  boxShadow: active ? `0 0 0 2px #fff, 0 0 0 4px ${bg === '#FFC800' ? '#b38c00' : bg}` : 'inset 0 0 0 1px rgba(0,0,0,.18)',
})

export default function MainNav() {
  const path = usePathname() ?? ''
  return (
    <nav style={{
      background: '#fff',
      borderBottom: '1px solid #d4d4d4',
      padding: '0 1.4rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      position: 'sticky',
      top: 56,
      zIndex: 500,
      boxShadow: '0 1px 4px rgba(0,0,0,.07)',
      height: 38,
    }}>
      {TABS.map(({ href, label }) => {
        const active = within(path, href)
        return (
          <Link key={href} href={href} className={`nav-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        )
      })}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        {PILLS.map(({ href, label, bg, fg, also }) => {
          const active = within(path, href) || !!also?.some(a => within(path, a))
          return (
            <Link key={href} href={href} style={pill(bg, fg, active)} aria-current={active ? 'page' : undefined}>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
