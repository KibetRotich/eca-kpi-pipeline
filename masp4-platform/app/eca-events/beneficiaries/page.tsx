import { parseFilters, getBeneficiaries } from '@/lib/eca-events/queries'
import { Card, BarChart } from '../charts'

export const dynamic = 'force-dynamic'

export default async function BeneficiariesPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getBeneficiaries(f)
  const { labels, cells } = d.coMatrix
  const maxCell = Math.max(1, ...cells.flat())

  return (
    <div>
      <Card title="Beneficiary-type distribution" height={Math.max(240, d.distribution.length * 22)}
        note={`Events per beneficiary type (a multi-type event counts once per type). n=${d.totalEvents.toLocaleString()} events.`}>
        <BarChart horizontal labels={d.distribution.map(x => x.label)} series={[{ label: 'Events', data: d.distribution.map(x => x.count) }]} />
      </Card>

      <div className="cc" style={{ padding: 0, overflow: 'auto', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Beneficiary-type co-occurrence (events with both types)
        </div>
        {labels.length ? (
          <table style={{ borderCollapse: 'collapse', fontSize: '.62rem', margin: '.3rem' }}>
            <thead><tr><th></th>{labels.map(l => <th key={l} style={{ padding: '.3rem', writingMode: 'vertical-rl', whiteSpace: 'nowrap', color: '#666', fontWeight: 700 }}>{l}</th>)}</tr></thead>
            <tbody>
              {labels.map((row, i) => (
                <tr key={row}>
                  <td style={{ padding: '.3rem .5rem', fontWeight: 700, color: '#666', whiteSpace: 'nowrap' }}>{row}</td>
                  {labels.map((_, j) => {
                    const v = cells[i][j]; const a = v / maxCell
                    return <td key={j} title={`${v}`} style={{ padding: '.3rem .45rem', textAlign: 'center', background: `rgba(255,200,0,${a.toFixed(2)})`, color: a > 0.5 ? '#000' : '#555' }}>{v || ''}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div style={{ padding: '.8rem', color: '#bbb' }}>No data for the current filters</div>}
      </div>

      <Card title="Top engaged organisations" height={Math.max(200, d.topOrgs.length * 22)}
        note="Events by named organisation / cooperative (organization_name free-text).">
        <BarChart horizontal labels={d.topOrgs.map(o => o.label)} series={[{ label: 'Events', data: d.topOrgs.map(o => o.count), color: '#111' }]} />
      </Card>
    </div>
  )
}
