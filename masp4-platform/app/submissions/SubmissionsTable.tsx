'use client'

import { useRouter } from 'next/navigation'

interface Submission {
  id: string; submission_uuid: string; form_id: string; country: string
  submitted_at: string; imported_at: string; status: string; review_notes: string | null
  projects?: { project_code: string; project_name: string; commodity: string } | null
}

interface Props {
  submissions: Submission[]; total: number; page: number; perPage: number
  currentStatus: string; currentCountry: string; currentFormId: string
  statusCounts: Record<string, number>; countries: string[]; formIds: string[]; error?: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', needs_review: 'Needs Review',
}

export default function SubmissionsTable({
  submissions, total, page, perPage, currentStatus, currentCountry,
  currentFormId, statusCounts, countries, formIds, error,
}: Props) {
  const router = useRouter()
  const totalPages = Math.ceil(total / perPage)

  function nav(params: Record<string, string>) {
    const sp = new URLSearchParams({ status: currentStatus, country: currentCountry, form_id: currentFormId, page: String(page), ...params })
    router.push('/submissions?' + sp.toString())
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.9rem' }}>
        <div>
          <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111' }}>Review Queue</div>
          <div style={{ fontSize: '.58rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 2 }}>
            ODK / Taro submissions awaiting review
          </div>
        </div>
        <a href="/upload">
          <button className="btn-primary">+ Import CSV</button>
        </a>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', background: '#f5f5f5', borderBottom: '3px solid #e0e0e0', marginBottom: '.8rem' }}>
        {Object.entries(STATUS_LABELS).map(([s, label]) => (
          <button
            key={s}
            onClick={() => nav({ status: s, page: '1' })}
            style={{
              padding: '.5rem 1.2rem',
              border: 'none',
              borderTop: `3px solid ${currentStatus === s ? '#FFC800' : 'transparent'}`,
              borderLeft: currentStatus === s ? '1px solid #e0e0e0' : '1px solid transparent',
              borderRight: currentStatus === s ? '1px solid #e0e0e0' : '1px solid transparent',
              background: currentStatus === s ? '#fff' : 'transparent',
              fontFamily: 'Open Sans, sans-serif',
              fontSize: '.62rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '1.2px',
              color: currentStatus === s ? '#000' : '#888',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {label}
            <span style={{
              marginLeft: '.4rem',
              background: currentStatus === s ? '#FFC800' : '#e0e0e0',
              color: currentStatus === s ? '#000' : '#666',
              padding: '.05rem .4rem',
              fontSize: '.6rem', fontWeight: 800,
            }}>
              {statusCounts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #d0d0d0', padding: '.4rem .75rem', marginBottom: '.8rem', display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#666' }}>Filter:</span>
        {[
          { label: 'Country', value: currentCountry, opts: countries, key: 'country', ph: 'All countries' },
          { label: 'Form',    value: currentFormId,  opts: formIds,   key: 'form_id', ph: 'All forms'     },
        ].map(({ label, value, opts, key, ph }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <span style={{ fontSize: '.58rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>{label}</span>
            <div style={{ position: 'relative' }}>
              <select value={value} onChange={e => nav({ [key]: e.target.value, page: '1' })} style={{ paddingRight: '1.4rem', minWidth: 120 }}>
                <option value="">{ph}</option>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
            </div>
          </div>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: '#888', fontWeight: 600 }}>
          {total.toLocaleString()} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '.65rem .9rem', border: '1px solid #ef9a9a', marginBottom: '.8rem', fontSize: '.7rem' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              {['Form type','Project','Country','Submitted','Status',''].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#bbb', padding: '3rem', fontSize: '.7rem' }}>
                  No {currentStatus} submissions{currentCountry ? ` for ${currentCountry}` : ''}.
                </td>
              </tr>
            )}
            {submissions.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/submissions/${s.id}`)}>
                <td style={{ fontWeight: 700 }}>{s.form_id}</td>
                <td>
                  {s.projects
                    ? <><span style={{ fontWeight: 700 }}>{s.projects.project_code}</span><br/><span style={{ color: '#888', fontSize: '.62rem' }}>{s.projects.commodity}</span></>
                    : <span style={{ color: '#ccc' }}>—</span>
                  }
                </td>
                <td>{s.country || '—'}</td>
                <td style={{ color: '#888', fontVariantNumeric: 'tabular-nums' }}>{s.submitted_at ? fmt(s.submitted_at) : '—'}</td>
                <td><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-secondary" style={{ fontSize: '.55rem', padding: '.2rem .6rem' }}>Review →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem', marginTop: '.9rem', alignItems: 'center' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => nav({ page: String(page - 1) })}>← Prev</button>
          <span style={{ fontSize: '.62rem', color: '#888', fontWeight: 600 }}>Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => nav({ page: String(page + 1) })}>Next →</button>
        </div>
      )}
    </div>
  )
}
