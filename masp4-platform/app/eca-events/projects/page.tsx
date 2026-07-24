import { parseFilters, getProjects } from '@/lib/eca-events/queries'
import { Card, BarChart } from '../charts'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getProjects(f)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Reach by commodity group" height={260}
          note={`Reported reach by commodity category. n=${d.totalEvents.toLocaleString()} events.`}>
          <BarChart labels={d.byCommodity.map(c => c.commodity)} series={[{ label: 'Reach', data: d.byCommodity.map(c => c.reach) }]} />
        </Card>
        <Card title="Events by commodity group" height={260} note="Event count by commodity category.">
          <BarChart labels={d.byCommodity.map(c => c.commodity)} series={[{ label: 'Events', data: d.byCommodity.map(c => c.events), color: '#111' }]} />
        </Card>
      </div>

      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Project league table
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr style={{ background: '#faf7ea', color: '#666', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Project</th>
            <th style={{ padding: '.4rem .8rem' }}>Events</th><th style={{ padding: '.4rem .8rem' }}>Reach</th>
            <th style={{ padding: '.4rem .8rem' }}>Countries</th><th style={{ padding: '.4rem .8rem' }}>% Female</th><th style={{ padding: '.4rem .8rem' }}>% Youth</th>
          </tr></thead>
          <tbody>
            {d.league.map(p => (
              <tr key={p.project} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem', fontWeight: 700 }}>{p.project}</td>
                <td style={{ padding: '.35rem .8rem' }}>{p.events.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{p.reach.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{p.countries}</td>
                <td style={{ padding: '.35rem .8rem' }}>{p.pctFemale != null ? `${p.pctFemale}%` : '—'}</td>
                <td style={{ padding: '.35rem .8rem' }}>{p.pctYouth != null ? `${p.pctYouth}%` : '—'}</td>
              </tr>
            ))}
            {!d.league.length && <tr><td colSpan={6} style={{ padding: '.8rem', textAlign: 'center', color: '#bbb' }}>No data for the current filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
