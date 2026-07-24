import { parseFilters, getDataQuality } from '@/lib/eca-events/queries'
import { Card, BarChart, Kpi, Caption } from '../charts'

export const dynamic = 'force-dynamic'

export default async function DataQualityPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const d = await getDataQuality(f)
  const lag = d.timeliness.buckets

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '.6rem', marginBottom: '.5rem' }}>
        <Kpi label="Missing GPS" value={d.missing.pct.gps != null ? `${d.missing.pct.gps}%` : '—'} sub={`${d.missing.gps.toLocaleString()} of ${d.missing.realN.toLocaleString()}`} />
        <Kpi label="Missing photo" value={d.missing.pct.photo != null ? `${d.missing.pct.photo}%` : '—'} sub={`${d.missing.photo.toLocaleString()}`} />
        <Kpi label="Missing attendance sheet" value={d.missing.pct.sheet != null ? `${d.missing.pct.sheet}%` : '—'} sub={`${d.missing.sheet.toLocaleString()}`} />
        <Kpi label="Missing admin-2" value={d.missing.pct.admin2 != null ? `${d.missing.pct.admin2}%` : '—'} sub={`${d.missing.admin2.toLocaleString()}`} />
        <Kpi label="Avg entry lag" value={d.timeliness.avgLagDays != null ? `${d.timeliness.avgLagDays}d` : '—'} accent sub="activity → submission" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: '.7rem' }}>
        <Card title="Real vs test submissions over time" height={230}
          note="Monthly real vs test records. Test records are excluded everywhere else by default.">
          <BarChart stacked labels={d.testRealByMonth.map(m => m.month)} series={[
            { label: 'Real', data: d.testRealByMonth.map(m => m.real), color: '#111' },
            { label: 'Test', data: d.testRealByMonth.map(m => m.test), color: '#FFC800' },
          ]} />
        </Card>
        <Card title="Data-entry timeliness" height={230}
          note="Days between activity date and submission (real records).">
          <BarChart labels={Object.keys(lag)} series={[{ label: 'Events', data: Object.values(lag), color: '#888' }]} />
        </Card>
      </div>

      <Caption>
        <strong>Aggregate ↔ individual reconciliation:</strong> reported reach {d.reconciliation.reportedReach.toLocaleString()} vs
        individual records {d.reconciliation.individualRecords.toLocaleString()} —
        gap {d.reconciliation.gap.toLocaleString()} ({d.reconciliation.capturePct != null ? `${d.reconciliation.capturePct}% captured individually` : 'n/a'}).
      </Caption>

      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.6rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Enumerator performance (all-time, aggregate)
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr style={{ background: '#faf7ea', color: '#666', textAlign: 'right' }}>
            <th style={{ textAlign: 'left', padding: '.4rem .8rem' }}>Enumerator</th>
            <th style={{ padding: '.4rem .8rem' }}>Submissions</th><th style={{ padding: '.4rem .8rem' }}>Avg completeness</th><th style={{ padding: '.4rem .8rem' }}>Test</th>
          </tr></thead>
          <tbody>
            {d.enumerators.map((e: any, i: number) => (
              <tr key={i} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '.35rem .8rem' }}>{e.enumerator}</td>
                <td style={{ padding: '.35rem .8rem' }}>{Number(e.submissions).toLocaleString()}</td>
                <td style={{ padding: '.35rem .8rem' }}>{e.avg_completeness}%</td>
                <td style={{ padding: '.35rem .8rem' }}>{e.test_records}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>Enumerator names are shown here only in aggregate (submission counts / completeness), never joined to row-level personal data. This table is all-time and not affected by the filters above.</Caption>
    </div>
  )
}
