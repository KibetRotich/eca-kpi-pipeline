/** Where & who — reach by region, beneficiary types and gender parity by project. */
import { parseFilters, getGeography, getBeneficiaries, getGenderYouth } from '@/lib/eca-events/queries'
import { Card, BarChart } from '../charts'

export const dynamic = 'force-dynamic'

export default async function WhereWhoPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const [g, b, gy] = await Promise.all([getGeography(f), getBeneficiaries(f), getGenderYouth(f)])
  const a1 = g.byAdmin1.slice(0, 15)
  const parity = gy.projectParity.slice(0, 15)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
      <Card title="Reach by county / region" height={Math.max(240, a1.length * 20)}
        note={`Reported reach by first admin level. Top ${a1.length}. n=${g.totalEvents.toLocaleString()} events.`}>
        <BarChart horizontal labels={a1.map(r => `${r.admin1} (${r.country})`)} series={[{ label: 'Reach', data: a1.map(r => r.reach) }]} />
      </Card>

      <Card title="Beneficiary types" height={Math.max(240, b.distribution.length * 22)}
        note="Events per beneficiary type (a multi-type event counts once per type).">
        <BarChart horizontal labels={b.distribution.map(x => x.label)} series={[{ label: 'Events', data: b.distribution.map(x => x.count), color: '#111' }]} />
      </Card>

      <Card title="Gender parity by project" height={Math.max(240, parity.length * 22)}
        note="% female of reported reach, by project. Bars near 50% indicate parity.">
        <BarChart horizontal labels={parity.map(p => p.project)} series={[{ label: '% Female', data: parity.map(p => p.pctFemale ?? 0), color: '#c79a00' }]} />
      </Card>
    </div>
  )
}
