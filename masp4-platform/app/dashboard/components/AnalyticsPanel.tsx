'use client'

/**
 * AnalyticsPanel — VSLA exploratory analytics (additive, self-contained).
 *
 * Client-side fetches /api/analytics and renders:
 *   • a sortable table of per-group performance ratios
 *   • an "Exploratory Insights" card with the 5 inferential results, each with
 *     its small-sample caveat shown in plain sight (never hidden in a tooltip).
 *
 * Styling is inline so this component touches no shared CSS. It degrades
 * gracefully on empty/null data.
 */

import { useEffect, useState } from 'react'

interface GroupRatios {
  groupId: string
  groupName: string
  savingsMobilizationRatio: number | null
  loanToSavingsRatio: number | null
  portfolioAtRiskProxy: number | null
  swfRatio: number | null
  leadershipCompleteness: number | null
  genderLeadershipRatio: number | null
  youthInclusionRatio: number | null
  retentionRate: number | null
  growthRate: number | null
  maturityScore: number | null
}

interface Inference {
  test: string
  label: string
  note: string
  skipped?: boolean
  rho?: number | null
  u?: number
  pApprox?: number | null
  pValue?: number | null
  n?: number
  [k: string]: any
}

interface AnalyticsResponse {
  groups: GroupRatios[]
  inferences: Record<string, Inference>
}

type NumericKey = Exclude<keyof GroupRatios, 'groupId' | 'groupName'>

const COLUMNS: { key: NumericKey; label: string }[] = [
  { key: 'savingsMobilizationRatio', label: 'Savings Mob.' },
  { key: 'loanToSavingsRatio', label: 'Loan/Savings' },
  { key: 'portfolioAtRiskProxy', label: 'PaR proxy' },
  { key: 'swfRatio', label: 'SWF ratio' },
  { key: 'leadershipCompleteness', label: 'Leadership' },
  { key: 'genderLeadershipRatio', label: 'Gender Ldr.' },
  { key: 'youthInclusionRatio', label: 'Youth Incl.' },
  { key: 'retentionRate', label: 'Retention' },
  { key: 'growthRate', label: 'Growth' },
  { key: 'maturityScore', label: 'Maturity' },
]

function fmt(v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export default function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'groupName' | NumericKey>('maturityScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    let cancelled = false
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleSort(key: 'groupName' | NumericKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'groupName' ? 'asc' : 'desc')
    }
  }

  const groups = data?.groups ?? []
  const sorted = [...groups].sort((a, b) => {
    if (sortKey === 'groupName') {
      const cmp = a.groupName.localeCompare(b.groupName)
      return sortDir === 'asc' ? cmp : -cmp
    }
    const av = a[sortKey]
    const bv = b[sortKey]
    // nulls always sort last regardless of direction
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const inferences = data ? Object.values(data.inferences) : []

  const th: React.CSSProperties = {
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: '2px solid #e2e2e2',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: '.72rem',
    userSelect: 'none',
  }
  const td: React.CSSProperties = {
    textAlign: 'right',
    padding: '5px 8px',
    borderBottom: '1px solid #f0f0f0',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <section
      style={{
        marginTop: '2rem',
        padding: '1rem 1.1rem',
        border: '1px solid #e6e6e6',
        borderRadius: 10,
        background: '#fff',
      }}
      aria-label="VSLA exploratory analytics"
    >
      <header style={{ marginBottom: '.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '.98rem', fontWeight: 800 }}>
          VSLA Exploratory Analytics
        </h2>
        <p style={{ margin: '.2rem 0 0', fontSize: '.74rem', color: '#666' }}>
          Per-group performance ratios and small-sample exploratory statistics.
          Directional only — see the caveats below each test.
        </p>
      </header>

      {error && (
        <p style={{ color: '#b00020', fontSize: '.8rem' }}>
          Could not load analytics: {error}
        </p>
      )}

      {!data && !error && (
        <p style={{ fontSize: '.8rem', color: '#666' }}>Loading analytics…</p>
      )}

      {data && groups.length === 0 && !error && (
        <p style={{ fontSize: '.8rem', color: '#666' }}>No VSLA submissions available yet.</p>
      )}

      {groups.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '.75rem' }}>
            <thead>
              <tr>
                <th
                  style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff' }}
                  onClick={() => toggleSort('groupName')}
                  scope="col"
                >
                  Group {sortKey === 'groupName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} style={th} onClick={() => toggleSort(c.key)} scope="col">
                    {c.label} {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => (
                <tr key={g.groupId}>
                  <td
                    style={{ ...td, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', fontWeight: 600 }}
                  >
                    {g.groupName}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} style={td}>
                      {fmt(g[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inferences.length > 0 && (
        <div style={{ marginTop: '1.1rem' }}>
          <h3 style={{ margin: '0 0 .5rem', fontSize: '.85rem', fontWeight: 700 }}>
            Exploratory Insights
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '.6rem',
            }}
          >
            {inferences.map((inf, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #ececec',
                  borderRadius: 8,
                  padding: '.6rem .7rem',
                  background: inf.skipped ? '#fafafa' : '#f7fbff',
                }}
              >
                <div style={{ fontSize: '.75rem', fontWeight: 700, marginBottom: '.25rem' }}>
                  {inf.label}
                </div>
                <div style={{ fontSize: '.72rem', color: '#333', marginBottom: '.3rem' }}>
                  {inf.skipped ? (
                    <span>Not computed.</span>
                  ) : inf.test === 'spearman' ? (
                    <span>
                      Spearman ρ = <strong>{fmt(inf.rho ?? null)}</strong> (n={inf.n})
                    </span>
                  ) : inf.test === 'mann-whitney' ? (
                    <span>
                      Mann–Whitney U = <strong>{fmt(inf.u ?? null)}</strong>, p≈{' '}
                      <strong>{fmt(inf.pApprox ?? null)}</strong>
                      <br />
                      (linked={inf.nLinked}, not-linked={inf.nNotLinked})
                    </span>
                  ) : inf.test === 'fisher' ? (
                    <span>
                      Fisher&rsquo;s exact p = <strong>{fmt(inf.pValue ?? null)}</strong> (n=
                      {inf.n})
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: '.68rem',
                    color: '#8a5a00',
                    background: '#fff7e6',
                    border: '1px solid #ffe2a8',
                    borderRadius: 5,
                    padding: '.25rem .4rem',
                  }}
                >
                  ⚠ {inf.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
