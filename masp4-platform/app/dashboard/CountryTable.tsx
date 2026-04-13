'use client'

interface CountryRow {
  country:       string
  s61_count:     number
  s62_count:     number
  s21_count:     number
  s25_count:     number
  s63_count:     number
  s64_companies: number
  s65_companies: number
}

export default function CountryTable({ byCountry }: { byCountry: CountryRow[] }) {
  const cols = [
    { key: 's61_count',     label: 'S6.1' },
    { key: 's62_count',     label: 'S6.2' },
    { key: 's21_count',     label: 'S2.1' },
    { key: 's25_count',     label: 'S2.5' },
    { key: 's63_count',     label: 'S6.3' },
    { key: 's64_companies', label: 'S6.4' },
    { key: 's65_companies', label: 'S6.5' },
  ]

  // Max per column for shading
  const maxes = cols.reduce((acc, c) => {
    acc[c.key] = Math.max(...byCountry.map(r => (r as any)[c.key] || 0), 1)
    return acc
  }, {} as Record<string, number>)

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <div style={{ padding: '.85rem 1.1rem', borderBottom: '1px solid var(--grey-2)', fontWeight: 700, fontSize: '.9rem' }}>
        By country
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--grey-0)' }}>
              <th style={{ padding: '.5rem .75rem', textAlign: 'left', fontWeight: 600, color: 'var(--grey-5)', borderBottom: '1px solid var(--grey-2)' }}>Country</th>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '.5rem .5rem', textAlign: 'center', fontWeight: 600, color: 'var(--grey-5)', borderBottom: '1px solid var(--grey-2)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byCountry.map((row, i) => (
              <tr key={row.country} style={{ borderBottom: '1px solid var(--grey-1)', background: i % 2 === 0 ? '#fff' : 'var(--grey-0)' }}>
                <td style={{ padding: '.5rem .75rem', fontWeight: 600 }}>{row.country}</td>
                {cols.map(c => {
                  const val = (row as any)[c.key] || 0
                  const intensity = Math.round((val / maxes[c.key]) * 60)
                  return (
                    <td key={c.key} style={{
                      padding: '.5rem .5rem',
                      textAlign: 'center',
                      background: val > 0 ? `rgba(26,107,60,${intensity / 100})` : 'transparent',
                      color: intensity > 35 ? '#fff' : 'var(--grey-7)',
                      fontWeight: val > 0 ? 600 : 400,
                    }}>
                      {val > 0 ? val.toLocaleString() : <span style={{ color: 'var(--grey-3)' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--grey-0)', fontWeight: 700, borderTop: '2px solid var(--grey-2)' }}>
              <td style={{ padding: '.5rem .75rem' }}>Total</td>
              {cols.map(c => (
                <td key={c.key} style={{ padding: '.5rem .5rem', textAlign: 'center', color: 'var(--green)' }}>
                  {byCountry.reduce((sum, r) => sum + ((r as any)[c.key] || 0), 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
