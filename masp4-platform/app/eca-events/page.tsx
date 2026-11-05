/**
 * Overview (management view) — headline KPIs, new & continuing farmers by month, female/youth
 * share, reach by commodity and the project league table. Reads the PII-free Supabase views via
 * the query layer.
 */
import { parseFilters, getOverview, getProjects, getFarmerDepth, getGenderYouth, getNewContinuing } from '@/lib/eca-events/queries'
import { Kpi, Card, BarChart, Caption } from './charts'

export const dynamic = 'force-dynamic'

export default async function OverviewPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const [o, p, fd, gy, nc] = await Promise.all([
    getOverview(f), getProjects(f), getFarmerDepth(f), getGenderYouth(f), getNewContinuing(f)])

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
        <Kpi label="Events" value={o.totalEvents} accent />
        <Kpi label="Total reach" value={o.totalReach} sub="Σ reported headcount" />
        <Kpi label="Unique farmers" value={fd.uniqueFarmers} sub="individually recorded, deduped" />
        <Kpi label="% Female" value={o.pctFemale != null ? `${o.pctFemale}%` : '—'} sub="of reported reach" />
        <Kpi label="% Youth ≤35" value={o.pctYouth != null ? `${o.pctYouth}%` : '—'} sub="of reported reach" />
      </div>

      <Caption>
        <strong>Reach vs unique farmers:</strong> “Total reach” is the sum of headcounts reported per event,
        so a farmer attending several events is counted each time. “Unique farmers” counts only people
        recorded individually, deduplicated — see the Farmer Depth tab. Demographic %s are of reported reach.
      </Caption>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '.7rem', marginTop: '.8rem' }}>
        <Card title="New & continuing farmers" height={240}
          note="Individually recorded farmers trained each month. New = first trained that calendar year; continuing = first trained in an earlier year (MASP convention). A farmer trained in several months is counted in each.">
          <BarChart stacked labels={nc.map(m => m.month)} series={[
            { label: 'New', data: nc.map(m => m.new), color: '#FFC800' },
            { label: 'Continuing', data: nc.map(m => m.continuing), color: '#111' },
          ]} />
        </Card>

        <Card title="Female & youth share over time" height={240}
          note="% of reported reach that is female / youth (≤35), by month.">
          <BarChart labels={gy.byMonth.map(m => m.month)} series={[
            { label: '% Female', data: gy.byMonth.map(m => m.pctFemale ?? 0), color: '#FFC800' },
            { label: '% Youth', data: gy.byMonth.map(m => m.pctYouth ?? 0), color: '#111' },
          ]} />
        </Card>

        <Card title="Reach by commodity" height={240}
          note="Reported reach by commodity. Events from before late 2025 take their project's commodity (see Data quality & notes).">
          <BarChart horizontal labels={p.byCommodity.map(c => c.commodity)} series={[{ label: 'Reach', data: p.byCommodity.map(c => c.reach) }]} />
        </Card>
      </div>

      {/* Project league table */}
      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem',
          fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Projects
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead>
            <tr style={{ background: '#faf7ea', textAlign: 'right', color: '#666' }}>
              <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Project</th>
              <th style={{ padding: '.4rem .8rem' }}>Events</th>
              <th style={{ padding: '.4rem .8rem' }}>Reach</th>
              <th style={{ padding: '.4rem .8rem' }}>Countries</th>
              <th style={{ padding: '.4rem .8rem' }}>% Female</th>
              <th style={{ padding: '.4rem .8rem' }}>% Youth</th>
            </tr>
          </thead>
          <tbody>
            {p.league.map(r => (
              <tr key={r.project} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem', fontWeight: 700 }}>{r.project}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.events.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.reach.toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.countries}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.pctFemale != null ? `${r.pctFemale}%` : '—'}</td>
                <td style={{ padding: '.35rem .8rem' }}>{r.pctYouth != null ? `${r.pctYouth}%` : '—'}</td>
              </tr>
            ))}
            {!p.league.length && (
              <tr><td colSpan={6} style={{ padding: '.8rem', textAlign: 'center', color: '#bbb' }}>No data for the current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
