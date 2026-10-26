/** What was delivered — event types, training topics and the ToT → lead-farmer cascade. */
import { parseFilters, getOverview, getCurriculum, getFacilitators } from '@/lib/eca-events/queries'
import { Card, BarChart, DoughnutChart } from '../charts'

export const dynamic = 'force-dynamic'

export default async function DeliveryPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const [o, c, fa] = await Promise.all([getOverview(f), getCurriculum(f), getFacilitators(f)])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Event-type mix" height={260}
          note={`Share of events by type. n=${o.totalEvents.toLocaleString()} events.`}>
          <DoughnutChart labels={o.byEventType.map(t => t.label)} data={o.byEventType.map(t => t.events)} />
        </Card>

        <Card title="Most-delivered training topics" height={Math.max(260, c.topTopics.length * 22)}
          note="Events per topic (top 15); a multi-topic event counts once per topic.">
          <BarChart horizontal labels={c.topTopics.map(t => t.label)} series={[{ label: 'Events', data: c.topTopics.map(t => t.count) }]} />
        </Card>
      </div>

      <div style={{ marginTop: '.7rem' }}>
        <Card title="Training cascade: ToT vs lead farmers over time" height={240}
          note="Monthly counts of trainer-of-trainers (ToT) vs lead-farmer facilitators.">
          <BarChart labels={fa.cascade.map(m => m.month)} series={[
            { label: 'ToT', data: fa.cascade.map(m => m.tot), color: '#111' },
            { label: 'Lead farmer', data: fa.cascade.map(m => m.lead), color: '#FFC800' },
          ]} />
        </Card>
      </div>
    </div>
  )
}
