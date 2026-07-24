import { parseFilters, getGeography } from '@/lib/eca-events/queries'
import { Card, BarChart, ScatterChart, Caption } from '../charts'

export const dynamic = 'force-dynamic'

export default async function GeographyPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getGeography(f)
  const a1 = d.byAdmin1.slice(0, 20)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Reach by admin level 1" height={Math.max(240, a1.length * 20)}
          note={`Reported reach by first admin level (county/region). Top ${a1.length}. n=${d.totalEvents.toLocaleString()} events.`}>
          <BarChart horizontal labels={a1.map(r => `${r.admin1} (${r.country})`)} series={[{ label: 'Reach', data: a1.map(r => r.reach) }]} />
        </Card>

        <Card title="GPS-tagged venues" height={280}
          note={`Each point is an event venue (lon×lat). ${d.gps.length.toLocaleString()} of ${d.totalEvents.toLocaleString()} events carry GPS. No basemap — spatial scatter only.`}>
          <ScatterChart points={d.gps.map(p => ({ x: p.lon, y: p.lat }))} xLabel="Longitude" yLabel="Latitude" />
        </Card>
      </div>

      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Coverage gaps — lowest-activity admin-2 areas
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr style={{ background: '#faf7ea', color: '#666', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Country</th>
            <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Admin 1</th>
            <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Admin 2</th>
            <th style={{ padding: '.4rem .8rem' }}>Events</th><th style={{ padding: '.4rem .8rem' }}>Reach</th>
          </tr></thead>
          <tbody>
            {d.coverageGap.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem' }}>{r.country}</td>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem' }}>{r.admin1}</td>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem' }}>{r.admin2}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.events}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.reach.toLocaleString()}</td>
              </tr>
            ))}
            {!d.coverageGap.length && <tr><td colSpan={5} style={{ padding: '.8rem', textAlign: 'center', color: '#bbb' }}>No data for the current filters</td></tr>}
          </tbody>
        </table>
      </div>
      <Caption>Coverage gaps show admin-2 areas with the fewest events under the current filters — candidates for expanded delivery. Admin-2 is free-text in the form, so spellings may vary.</Caption>
    </div>
  )
}
