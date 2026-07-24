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
        <Kpi label="ID-capture rate" value={d.idCaptureRate != null ? `${d.idCaptureRate}%` : '—'} sub={`${d.verified.toLocaleString()} verified`} />
        <Kpi label="Phone-capture rate" value={d.phoneCaptureRate != null ? `${d.phoneCaptureRate}%` : '—'} sub={`${d.withPhone.toLocaleString()} with phone`} />
      </div>

      <Caption>
        <strong>Three denominators, never conflated:</strong> reported reach ({d.reportedReach.toLocaleString()})
        ≥ individual records ({d.rawRecords.toLocaleString()}) ≥ unique deduped farmers
        ({d.uniqueFarmers.toLocaleString()}). Dedup uses <code>farmer_id</code> where present, else a
        normalised name+phone key — name-only matches are imperfect, so unique counts are approximate.
      </Caption>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem', marginTop: '.7rem' }}>
        <Card title="Reach vs records vs unique farmers" height={240}
          note="The three denominators side by side.">
          <BarChart labels={['Reported reach', 'Individual records', 'Unique farmers']}
            series={[{ label: 'Count', data: [d.reportedReach, d.rawRecords, d.uniqueFarmers] }]} />
        </Card>
        <Card title="New vs returning over time" height={240}
          note="Each individual record classed as a first-ever appearance (new) or a repeat (returning), by month.">
          <BarChart stacked labels={d.monthly.map(m => m.month)} series={[
            { label: 'New', data: d.monthly.map(m => m.new), color: '#FFC800' },
            { label: 'Returning', data: d.monthly.map(m => m.returning), color: '#111' },
          ]} />
        </Card>
      </div>

      <Card title="Session-frequency distribution" height={220}
        note="How many distinct farmers attended 1, 2, 3, 4–5 or 6+ recorded sessions.">
        <BarChart labels={d.freq.map(b => b.bucket)} series={[{ label: 'Farmers', data: d.freq.map(b => b.farmers), color: '#c79a00' }]} />
      </Card>
    </div>
  )
}
