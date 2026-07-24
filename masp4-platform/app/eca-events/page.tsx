/**
 * Executive Overview — KPI cards, reach/events trend, event-type mix,
 * country scorecard. Reads the PII-free Supabase views via the query layer.
 */
import { parseFilters, getOverview } from '@/lib/eca-events/queries'
import { Kpi, Card, BarChart, LineChart, DoughnutChart, Caption } from './charts'

export const dynamic = 'force-dynamic'

export default async function OverviewPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const o = await getOverview(f)

  const months = o.byMonth.map(m => m.month)
  const scope = f.includeTest ? 'all records' : 'real records only'

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
        <Kpi label="Events" value={o.totalEvents} accent sub={scope} />
        <Kpi label="Total reach" value={o.totalReach} sub="Σ reported headcount" />
        <Kpi label="% Female" value={o.pctFemale != null ? `${o.pctFemale}%` : '—'} sub="of reported reach" />
        <Kpi label="% Youth ≤35" value={o.pctYouth != null ? `${o.pctYouth}%` : '—'} sub="of reported reach" />
        <Kpi label="Countries" value={o.activeCountries} />
        <Kpi label="Projects" value={o.activeProjects} />
      </div>

      <Caption>
        <strong>Reach vs individually-recorded:</strong> “Total reach” is the sum of reported
        headcounts (<code>total_participants</code>), <em>not</em> the number of individually
        recorded participants ({o.individualRecords.toLocaleString()} across {o.totalEvents.toLocaleString()} events).
        Reported reach ≥ individual records ≥ unique farmers. Demographic %s are of reported reach.
      </Caption>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem', marginTop: '.8rem' }}>
        <Card title="Reach & events by month" height={240}
          note={`Monthly reported reach (bars) and event count (line). ${scope}. n=${o.totalEvents.toLocaleString()} events.`}>
          <LineChart labels={months} series={[
            { label: 'Reach', data: o.byMonth.map(m => m.reach), color: '#FFC800' },
            { label: 'Events', data: o.byMonth.map(m => m.events), color: '#111' },
          ]} />
        </Card>

        <Card title="Event-type mix" height={240}
          note={`Share of events by type. ${scope}.`}>
          <DoughnutChart labels={o.byEventType.map(t => t.label)} data={o.byEventType.map(t => t.events)} />
        </Card>
      </div>

      {/* Country scorecard */}
      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem',
          fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Country scorecard
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead>
            <tr style={{ background: '#faf7ea', textAlign: 'right', color: '#666' }}>
              <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Country</th>
              <th style={{ padding: '.4rem .8rem' }}>Events</th>
              <th style={{ padding: '.4rem .8rem' }}>Reach</th>
              <th style={{ padding: '.4rem .8rem' }}>% Female</th>
              <th style={{ padding: '.4rem .8rem' }}>% Youth</th>
            </tr>
          </thead>
          <tbody>
            {o.byCountry.map(c => (
              <tr key={c.country} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem', fontWeight: 700 }}>{c.country}</td>
                <td style={{ padding: '.35rem .8rem' }}>{c.events.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{c.reach.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{c.pctFemale != null ? `${c.pctFemale}%` : '—'}</td>
                <td style={{ padding: '.35rem .8rem' }}>{c.pctYouth != null ? `${c.pctYouth}%` : '—'}</td>
              </tr>
            ))}
            {!o.byCountry.length && (
              <tr><td colSpan={5} style={{ padding: '.8rem', textAlign: 'center', color: '#bbb' }}>No data for the current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
