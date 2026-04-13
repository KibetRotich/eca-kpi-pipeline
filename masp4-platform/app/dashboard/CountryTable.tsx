'use client'

interface CountryRow {
  country: string
  s61_count: number; s62_count: number; s21_count: number; s25_count: number
  s63_count: number; s64_companies: number; s65_companies: number
}

const FLAGS: Record<string, string> = {
  Kenya: '🇰🇪', Uganda: '🇺🇬', Tanzania: '🇹🇿', Ethiopia: '🇪🇹', Congo: '🇨🇩',
}

const COLS = [
  { key: 's61_count',     label: 'S6.1' },
  { key: 's62_count',     label: 'S6.2' },
  { key: 's21_count',     label: 'S2.1' },
  { key: 's25_count',     label: 'S2.5' },
  { key: 's63_count',     label: 'S6.3' },
  { key: 's64_companies', label: 'S6.4' },
  { key: 's65_companies', label: 'S6.5' },
]

export default function CountryTable({ byCountry }: { byCountry: CountryRow[] }) {
  const maxes = COLS.reduce((acc, c) => {
    acc[c.key] = Math.max(...byCountry.map(r => (r as any)[c.key] || 0), 1)
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        background: '#111', color: '#fff',
        padding: '.55rem .9rem',
        fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px',
      }}>
        Country breakdown
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '.68rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Country</th>
              {COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {byCountry.map((row, i) => (
              <tr key={row.country} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ fontWeight: 700 }}>
                  <span style={{ marginRight: '.4rem' }}>{FLAGS[row.country] ?? ''}</span>
                  {row.country}
                </td>
                {COLS.map(c => {
                  const val = (row as any)[c.key] || 0
                  const intensity = Math.round((val / maxes[c.key]) * 80)
                  return (
                    <td key={c.key} style={{
                      textAlign: 'center',
                      fontWeight: val > 0 ? 700 : 400,
                      background: val > 0 ? `rgba(255,200,0,${intensity / 100})` : 'transparent',
                      color: intensity > 55 ? '#000' : '#222',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {val > 0 ? val.toLocaleString() : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#fffce8', borderTop: '2px solid #FFC800' }}>
              <td style={{ fontWeight: 800, fontSize: '.58rem', textTransform: 'uppercase', letterSpacing: '.5px' }}>Total</td>
              {COLS.map(c => (
                <td key={c.key} style={{ textAlign: 'center', fontWeight: 800, color: '#000', fontVariantNumeric: 'tabular-nums' }}>
                  {byCountry.reduce((s, r) => s + ((r as any)[c.key] || 0), 0).toLocaleString()}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
