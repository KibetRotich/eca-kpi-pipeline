import { parseFilters, getCurriculum } from '@/lib/eca-events/queries'
import { Card, BarChart, Kpi } from '../charts'

export const dynamic = 'force-dynamic'

export default async function CurriculumPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getCurriculum(f)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
        <Kpi label="Manual/tool usage" value={d.manualUsage.rate != null ? `${d.manualUsage.rate}%` : '—'} accent sub={`${d.manualUsage.yes.toLocaleString()} of ${(d.manualUsage.yes + d.manualUsage.no).toLocaleString()} events`} />
        <Kpi label="Distinct topics" value={d.topTopics.length + d.bottomTopics.length} />
        <Kpi label="CFA modules seen" value={d.modules.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Most-delivered training topics" height={Math.max(240, d.topTopics.length * 22)}
          note={`Events per topic (top 15). n=${d.totalEvents.toLocaleString()} events; a multi-topic event counts once per topic.`}>
          <BarChart horizontal labels={d.topTopics.map(t => t.label)} series={[{ label: 'Events', data: d.topTopics.map(t => t.count) }]} />
        </Card>
        <Card title="Carbon Farming Academy — module coverage" height={Math.max(240, d.modules.length * 22)}
          note="Events per training module (from the training_modules list).">
          <BarChart horizontal labels={d.modules.map(m => m.label)} series={[{ label: 'Events', data: d.modules.map(m => m.count), color: '#111' }]} />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem', marginTop: '.7rem' }}>
        <Card title="Least-covered topics" height={Math.max(200, d.bottomTopics.length * 22)}
          note="Topics with the fewest events — potential curriculum gaps.">
          <BarChart horizontal labels={d.bottomTopics.map(t => t.label)} series={[{ label: 'Events', data: d.bottomTopics.map(t => t.count), color: '#888' }]} />
        </Card>
        <Card title="Free-text topic word frequency" height={Math.max(200, d.words.length * 12)}
          note="Word frequency across free-text training titles / manual names (stop-words removed). Indicative only.">
          <BarChart horizontal labels={d.words.slice(0, 20).map(w => w.label)} series={[{ label: 'Mentions', data: d.words.slice(0, 20).map(w => w.count), color: '#c79a00' }]} />
        </Card>
      </div>
    </div>
  )
}
