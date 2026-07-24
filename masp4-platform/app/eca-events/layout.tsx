import { Suspense } from 'react'
import EcaNav from './EcaNav'
import FilterBar from './FilterBar'
import ExportButton from './ExportButton'
import { getFilterOptions, getSyncMeta } from '@/lib/eca-events/queries'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'ECA Trainings & Events — Analytics' }

export default async function EcaEventsLayout({ children }: { children: React.ReactNode }) {
  const [options, meta] = await Promise.all([getFilterOptions(), getSyncMeta()])
  const refreshed = meta?.refreshed_at
    ? new Date(meta.refreshed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'

  return (
    <div>
      <header style={{ marginBottom: '.7rem', display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>ECA Trainings &amp; Events Tracker</h1>
          <p style={{ margin: '.2rem 0 0', fontSize: '.72rem', color: '#666' }}>
            Training &amp; event delivery analytics — Kenya, Uganda, Tanzania, Ethiopia.
          </p>
        </div>
        <div style={{ fontSize: '.58rem', color: '#999', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.3rem' }}>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
            <Suspense fallback={null}><ExportButton /></Suspense>
          </div>
          <div>
            Last data refresh: <strong style={{ color: '#555' }}>{refreshed}</strong>
            {meta ? <> · {Number(meta.real_count ?? 0).toLocaleString()} real / {Number(meta.test_count ?? 0).toLocaleString()} test</> : null}
            <span style={{ color: '#bbb' }}> · Print → Save as PDF for a full-page export</span>
            {meta?.choices_provisional ? <div style={{ color: '#c47f00' }}>⚠ provisional label map</div> : null}
          </div>
        </div>
      </header>

      <Suspense fallback={null}><EcaNav /></Suspense>
      <Suspense fallback={null}><FilterBar options={options} /></Suspense>

      {children}
    </div>
  )
}
