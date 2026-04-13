import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MASP IV Data Platform',
  description: 'Solidaridad ECA — MASP IV data import and approval',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          background: '#0f4c2a',
          color: '#fff',
          padding: '0 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          height: '52px',
          boxShadow: '0 2px 4px rgba(0,0,0,.2)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '.02em' }}>
            MASP IV · Data Platform
          </span>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,.85)', fontSize: '.875rem' }}>
            Dashboard
          </a>
          <a href="/submissions" style={{ color: 'rgba(255,255,255,.85)', fontSize: '.875rem' }}>
            Review Queue
          </a>
          <a href="/upload" style={{ color: 'rgba(255,255,255,.85)', fontSize: '.875rem' }}>
            Import CSV
          </a>
        </nav>
        <main style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
