import type { Metadata } from 'next'
import './globals.css'
import { RoleProvider } from '@/lib/role-context'
import AuthButton from '@/components/AuthButton'

export const metadata: Metadata = {
  title: 'MASP IV Data Platform — Solidaridad ECA',
  description: 'Solidaridad East & Central Africa — MASP IV monitoring and data platform',
}

const SolLogo = () => (
  <div style={{
    background: '#fff',
    padding: '5px 12px 5px 10px',
    display: 'flex',
    alignItems: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)',
  }}>
    <img src="/solidaridad-logo.png" alt="Solidaridad" style={{ height: 32, width: 'auto', display: 'block' }} />
  </div>
)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{
          background: '#FFC800',
          padding: '0 1.4rem',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#000', lineHeight: 1 }}>
                MASP IV · Data Platform
              </div>
              <div style={{ fontSize: '.56rem', fontWeight: 800, color: '#000', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 2 }}>
                East &amp; Central Africa &middot; 2026–2030
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <AuthButton />
            <SolLogo />
          </div>
        </header>

        {/* ── Nav bar ─────────────────────────────────────────────────────── */}
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
          {[
            { href: '/instructions', label: 'Instructions'           },
            { href: '/upload',       label: 'Import CSV'             },
            { href: '/targets',      label: 'Targets & Achievements' },
            { href: '/dashboard',    label: 'Dashboard'              },
          ].map(({ href, label }) => (
            <a key={href} href={href} className="nav-link">{label}</a>
          ))}
        </nav>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <main style={{ padding: '.9rem 1.4rem 4rem' }}>
          <RoleProvider>{children}</RoleProvider>
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{
          background: '#2a2a2a',
          padding: '.6rem 1.4rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '.56rem', color: '#888', letterSpacing: '1px', textTransform: 'uppercase' }}>
            &copy; Solidaridad East &amp; Central Africa
          </span>
          <span style={{ color: '#FFC800', fontWeight: 800, fontSize: '.6rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
            MASP IV · 2026–2030
          </span>
        </footer>

      </body>
    </html>
  )
}
