import { parseFilters, getFarmerDepth } from '@/lib/eca-events/queries'
import { Card, BarChart, Kpi, Caption } from '../charts'

export const dynamic = 'force-dynamic'

export default async function FarmersPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getFarmerDepth(f)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.5rem' }}>
        <Kpi label="Reported reach" value={d.reportedReach} sub="Σ headcount" />
        <Kpi label="Individual records" value={d.rawRecords} sub="participant rows" />
        <Kpi label="Unique farmers" value={d.uniqueFarmers} accent sub="deduped" />
      </div>

      <Caption>
        <strong>Three denominators, never conflated:</strong> reported reach ({d.reportedReach.toLocaleString()})
        ≥ individual records ({d.rawRecords.toLocaleString()}) ≥ unique deduped farmers
        ({d.uniqueFarmers.toLocaleString()}). Dedup uses <code>farmer_id</code> where present, else a
        normalised name+phone key — name-only matches are imperfect, so unique counts are approximate.
      </Caption>

      <div style={{ marginTop: '.7rem' }}>
        <Card title="New vs returning farmers over time" height={240}
          note="Each individual record classed as a first-ever appearance (new) or a repeat (returning), by month.">
          <BarChart stacked labels={d.monthly.map(m => m.month)} series={[
            { label: 'New', data: d.monthly.map(m => m.new), color: '#FFC800' },
            { label: 'Returning', data: d.monthly.map(m => m.returning), color: '#111' },
          ]} />
        </Card>
      </div>
    </div>
  )
}
