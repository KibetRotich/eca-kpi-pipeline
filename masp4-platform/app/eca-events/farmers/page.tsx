import { parseFilters, getFarmerDepth, getNewReturning } from '@/lib/eca-events/queries'
import { Card, BarChart, Kpi, Caption } from '../charts'

export const dynamic = 'force-dynamic'

export default async function FarmersPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const [d, nc] = await Promise.all([getFarmerDepth(f), getNewReturning(f)])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.5rem' }}>
        <Kpi label="Reported reach" value={d.reportedReach} sub="Σ headcount" />
        <Kpi label="Individual records" value={d.rawRecords}
          sub={`${d.typedRecords.toLocaleString()} typed in · ${d.selectedRecords.toLocaleString()} from list`} />
        <Kpi label="Unique farmers" value={d.uniqueFarmers} accent sub="deduped" />
      </div>

      <Caption>
        <strong>Three denominators, never conflated:</strong> reported reach ({d.reportedReach.toLocaleString()},
        the headcount facilitators report), individual records ({d.rawRecords.toLocaleString()}, one per farmer
        recorded by name per event) and unique deduped farmers ({d.uniqueFarmers.toLocaleString()}). Records are farmers typed in at the event or picked from the
        registered-farmer list. Dedup uses the farmer ID (scanned, or the list&apos;s registry ID — the same
        scheme) where present, else a normalised name+phone key. Name-only matches are imperfect, and a farmer
        typed in by name at one event and picked from the list at another cannot be linked, so unique counts
        are approximate.
      </Caption>

      <div style={{ marginTop: '.7rem' }}>
        <Card title="New & returning farmers" height={240}
          note="Distinct farmers trained each month. New = first training ever; returning = trained in an earlier month — same as the Overview.">
          <BarChart stacked labels={nc.map(m => m.month)} series={[
            { label: 'New', data: nc.map(m => m.new), color: '#FFC800' },
            { label: 'Returning', data: nc.map(m => m.returning), color: '#111' },
          ]} />
        </Card>
      </div>
    </div>
  )
}
