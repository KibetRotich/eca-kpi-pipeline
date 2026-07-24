import { parseFilters, getFacilitators } from '@/lib/eca-events/queries'
import { Card, DoughnutChart, BarChart, Kpi } from '../charts'

export const dynamic = 'force-dynamic'

export default async function FacilitatorsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getFacilitators(f)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '.6rem', marginBottom: '.8rem' }}>
        <Kpi label="Facilitators recorded" value={d.facilitatorCount} accent />
        <Kpi label="Facilitator : participant" value={d.ratio != null ? `1 : ${d.ratio}` : '—'} sub="recorded facilitators vs reported reach" />
        <Kpi label="Partner-org diversity" value={d.orgDiversity} sub="distinct organisations" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Facilitator-type mix" height={240} note="Share of facilitator records by type.">
          <DoughnutChart labels={d.typeMix.map(t => t.label)} data={d.typeMix.map(t => t.count)} />
        </Card>
        <Card title="ToT vs lead-farmer cascade over time" height={240}
          note="Monthly counts of ToT vs lead-farmer facilitators — the training cascade. Types matched by label.">
          <BarChart labels={d.cascade.map(c => c.month)} series={[
            { label: 'ToT', data: d.cascade.map(c => c.tot), color: '#111' },
            { label: 'Lead farmer', data: d.cascade.map(c => c.lead), color: '#FFC800' },
          ]} />
        </Card>
      </div>

      <Card title="Top partner organisations" height={Math.max(200, d.topOrgs.length * 22)}
        note="Facilitator records by organisation.">
        <BarChart horizontal labels={d.topOrgs.map(o => o.label)} series={[{ label: 'Records', data: d.topOrgs.map(o => o.count), color: '#888' }]} />
      </Card>
    </div>
  )
}
