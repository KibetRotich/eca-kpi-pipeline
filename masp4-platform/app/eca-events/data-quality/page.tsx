/** Data quality & notes — completeness KPIs, entry timeliness and the condensed methodology. */
import { parseFilters, getDataQuality, getFarmerDepth } from '@/lib/eca-events/queries'
import { Card, BarChart, Kpi, Caption } from '../charts'

export const dynamic = 'force-dynamic'

export default async function DataQualityPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const f = parseFilters(await searchParams)
  const [d, fd] = await Promise.all([getDataQuality(f), getFarmerDepth(f)])
  const lag = d.timeliness.buckets
  const pct = (v: number | null) => (v != null ? `${v}%` : '—')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '.6rem', marginBottom: '.5rem' }}>
        <Kpi label="Missing GPS" value={pct(d.missing.pct.gps)} sub={`${d.missing.gps.toLocaleString()} of ${d.missing.realN.toLocaleString()}`} />
        <Kpi label="Missing photo" value={pct(d.missing.pct.photo)} sub={`${d.missing.photo.toLocaleString()}`} />
        <Kpi label="Missing attendance sheet" value={pct(d.missing.pct.sheet)} sub={`${d.missing.sheet.toLocaleString()}`} />
        <Kpi label="Missing admin-2" value={pct(d.missing.pct.admin2)} sub={`${d.missing.admin2.toLocaleString()}`} />
        <Kpi label="ID-capture rate" value={pct(fd.idCaptureRate)} sub={`${fd.verified.toLocaleString()} verified`} />
        <Kpi label="Phone-capture rate" value={pct(fd.phoneCaptureRate)} sub={`${fd.withPhone.toLocaleString()} with phone`} />
        <Kpi label="Avg entry lag" value={d.timeliness.avgLagDays != null ? `${d.timeliness.avgLagDays}d` : '—'} accent sub="activity → submission" />
      </div>

      <div style={{ marginTop: '.7rem' }}>
        <Card title="Data-entry timeliness" height={230}
          note="Days between activity date and submission (real records).">
          <BarChart labels={Object.keys(lag)} series={[{ label: 'Events', data: Object.values(lag), color: '#888' }]} />
        </Card>
      </div>

      <div className="cc" style={{ padding: 0, overflow: 'hidden', marginTop: '.8rem' }}>
        <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          Definitions &amp; limitations
        </div>
        <div style={{ padding: '.7rem .9rem', fontSize: '.72rem', lineHeight: 1.6, color: '#333' }}>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li><strong>Event</strong> — one KoboToolbox submission = one training or event delivered. Test records are excluded.</li>
            <li><strong>Reported reach</strong> ≥ <strong>individual records</strong> ≥ <strong>unique farmers</strong>: reach is the
              headcount reported per event ({d.reconciliation.reportedReach.toLocaleString()}); {d.reconciliation.capturePct != null ? `${d.reconciliation.capturePct}%` : 'part'} of
              it is captured as individual records ({d.reconciliation.individualRecords.toLocaleString()}), which are then deduplicated.</li>
            <li><strong>% female / % youth</strong> are of reported reach. Youth = ≤35 years.</li>
            <li>Unique-farmer counts are approximate where identity rests on typed names rather than a farmer ID.</li>
            <li>Admin-2 and organisation names are free text, so spellings vary.</li>
            <li>No personal data is shown: the dashboard reads only PII-free views.</li>
            <li>Source: KoboToolbox form <code>aCt5s6EGUnE7UxJVeuXjpY</code>, refreshed every 3 hours (time shown in the header).</li>
          </ul>
        </div>
      </div>
      <Caption>Completeness and timeliness figures follow the filters above.</Caption>
    </div>
  )
}
