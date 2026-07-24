import { parseFilters, getGenderYouth } from '@/lib/eca-events/queries'
import { Card, LineChart, BarChart } from '../charts'

export const dynamic = 'force-dynamic'

export default async function GenderYouthPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getGenderYouth(f)
  const parity = d.projectParity.slice(0, 18)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Female & youth share over time" height={240}
          note={`% of reported reach that is female / youth (≤35), by month. n=${d.totalEvents.toLocaleString()} events.`}>
          <LineChart labels={d.byMonth.map(m => m.month)} series={[
            { label: '% Female', data: d.byMonth.map(m => m.pctFemale ?? 0), color: '#FFC800' },
            { label: '% Youth', data: d.byMonth.map(m => m.pctYouth ?? 0), color: '#111' },
          ]} />
        </Card>

        <Card title="Gender by event type" height={240}
          note="Reported female vs male-or-other headcount, by event type.">
          <BarChart stacked labels={d.byEventType.map(e => e.label)} series={[
            { label: 'Female', data: d.byEventType.map(e => e.female), color: '#FFC800' },
            { label: 'Male/other', data: d.byEventType.map(e => e.male), color: '#111' },
          ]} />
        </Card>
      </div>

      <Card title="Project gender parity ranking" height={Math.max(240, parity.length * 22)}
        note="% female of reported reach, by project (highest first). Bars near 50% indicate parity.">
        <BarChart horizontal labels={parity.map(p => p.project)} series={[{ label: '% Female', data: parity.map(p => p.pctFemale ?? 0), color: '#c79a00' }]} />
      </Card>
    </div>
  )
}
