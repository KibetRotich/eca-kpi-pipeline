'use client'

/**
 * Tree-Survival monitoring — two SEPARATE cohort dashboards (Uganda / Kenya).
 * Kept separate by design (different countries, species sets, survey grain — never
 * pooled). A lightweight tab switches which self-contained static dashboard the
 * iframe shows (built by pipeline/hc_survival/build_dashboard.py into /public).
 */
import { useState } from 'react'

const TABS = [
  { key: 'ug', label: '🇺🇬 Uganda — Harvesting Carbon', src: '/HC_Survival_UG_Dashboard.html' },
  { key: 'ke', label: '🇰🇪 Kenya — SAVE KE', src: '/SAVE_KE_Survival_Dashboard.html' },
] as const

export default function SurvivalDashboards() {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('ug')
  const current = TABS.find((t) => t.key === active)!

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              padding: '7px 14px',
              fontSize: '.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: 6,
              border: '1px solid #2e7d32',
              background: active === t.key ? '#2e7d32' : '#fff',
              color: active === t.key ? '#fff' : '#2e7d32',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <iframe
        key={current.key}
        src={current.src}
        title={current.label}
        style={{
          display: 'block',
          width: '100%',
          height: 'calc(100vh - 275px)',
          border: '1px solid #d4d4d4',
          borderRadius: 6,
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,.07)',
        }}
      />
    </div>
  )
}
