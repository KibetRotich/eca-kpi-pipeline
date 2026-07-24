import { parseFilters, getTimePlanning } from '@/lib/eca-events/queries'
import { Card, BarChart, LineChart, Kpi } from '../charts'

export const dynamic = 'force-dynamic'

export default async function TimePlanningPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getTimePlanning(f)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.6rem' }}>
        <Kpi label="Upcoming activities" value={d.upcomingCount} accent sub="future next_training_date" />
        <Kpi label="Months active" value={d.cadence.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Seasonality — events by month of year" height={230}
          note={`Events aggregated across all years by calendar month. n=${d.totalEvents.toLocaleString()} events.`}>
          <BarChart labels={d.seasonality.map(s => s.month)} series={[{ label: 'Events', data: d.seasonality.map(s => s.events) }]} />
        </Card>
        <Card title="Delivery cadence" height={230} note="Events per month over time.">
          <LineChart labels={d.cadence.map(c => c.month)} series={[{ label: 'Events', data: d.cadence.map(c => c.events), color: '#111' }]} />
        </Card>
      </div>

      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Upcoming activity pipeline ({d.upcomingCount})
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr style={{ background: '#faf7ea', color: '#666', textAlign: 'left' }}>
            <th style={{ padding: '.4rem .8rem' }}>Next date</th><th style={{ padding: '.4rem .8rem' }}>Project</th><th style={{ padding: '.4rem .8rem' }}>Commodity</th>
          </tr></thead>
          <tbody>
            {d.upcoming.map((u, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '.35rem .8rem', fontWeight: 700 }}>{u.date}</td>
                <td style={{ padding: '.35rem .8rem' }}>{u.project}</td>
                <td style={{ padding: '.35rem .8rem' }}>{u.commodity}</td>
              </tr>
            ))}
            {!d.upcoming.length && <tr><td colSpan={3} style={{ padding: '.8rem', textAlign: 'center', color: '#bbb' }}>No upcoming activities recorded (next_training_date is captured mainly by SAVE KE).</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
