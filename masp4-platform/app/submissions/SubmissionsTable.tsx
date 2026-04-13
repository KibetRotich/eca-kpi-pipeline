'use client'

import { useRouter } from 'next/navigation'

interface Submission {
  id: string
  submission_uuid: string
  form_id: string
  country: string
  submitted_at: string
  imported_at: string
  status: string
  review_notes: string | null
  raw_data?: Record<string, unknown>
  projects?: { project_code: string; project_name: string; commodity: string } | null
}

interface Props {
  submissions:    Submission[]
  total:          number
  page:           number
  perPage:        number
  currentStatus:  string
  currentCountry: string
  currentFormId:  string
  statusCounts:   Record<string, number>
  countries:      string[]
  formIds:        string[]
  error?:         string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function SubmissionsTable({
  submissions, total, page, perPage,
  currentStatus, currentCountry, currentFormId,
  statusCounts, countries, formIds, error,
}: Props) {
  const router = useRouter()
  const totalPages = Math.ceil(total / perPage)

  function nav(params: Record<string, string>) {
    const sp = new URLSearchParams({
      status:  currentStatus,
      country: currentCountry,
      form_id: currentFormId,
      page:    String(page),
      ...params,
    })
    router.push('/submissions?' + sp.toString())
  }

  const STATUS_LABELS: Record<string, string> = {
    pending:      'Pending',
    approved:     'Approved',
    rejected:     'Rejected',
    needs_review: 'Needs Review',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Review Queue</h1>
        <a href="/upload">
          <button className="btn-primary">+ Import CSV</button>
        </a>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--grey-2)' }}>
        {Object.entries(STATUS_LABELS).map(([s, label]) => (
          <button
            key={s}
            onClick={() => nav({ status: s, page: '1' })}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: currentStatus === s ? '2px solid var(--green)' : '2px solid transparent',
              borderRadius: 0,
              padding: '.6rem 1.1rem',
              fontWeight: currentStatus === s ? 700 : 400,
              color: currentStatus === s ? 'var(--green)' : 'var(--grey-5)',
              cursor: 'pointer',
              marginBottom: '-2px',
              fontSize: '.875rem',
            }}
          >
            {label}
            <span style={{
              marginLeft: '.4rem',
              background: currentStatus === s ? 'var(--green-l)' : 'var(--grey-1)',
              color: currentStatus === s ? 'var(--green)' : 'var(--grey-5)',
              borderRadius: '999px',
              padding: '.05rem .45rem',
              fontSize: '.75rem',
              fontWeight: 600,
            }}>
              {statusCounts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={currentCountry} onChange={e => nav({ country: e.target.value, page: '1' })}>
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={currentFormId} onChange={e => nav({ form_id: e.target.value, page: '1' })}>
          <option value="">All form types</option>
          {formIds.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '.875rem', color: 'var(--grey-5)', alignSelf: 'center' }}>
          {total} submission{total !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div style={{ background: 'var(--red-l)', color: 'var(--red)', padding: '.75rem 1rem', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--grey-0)', borderBottom: '2px solid var(--grey-2)' }}>
              {['Form type','Project','Country','Submitted','Status',''].map(h => (
                <th key={h} style={{ padding: '.65rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--grey-5)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--grey-3)' }}>
                  No {currentStatus} submissions{currentCountry ? ` for ${currentCountry}` : ''}.
                </td>
              </tr>
            )}
            {submissions.map((s, i) => (
              <tr
                key={s.id}
                style={{
                  borderBottom: '1px solid var(--grey-2)',
                  background: i % 2 === 0 ? '#fff' : 'var(--grey-0)',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/submissions/${s.id}`)}
              >
                <td style={{ padding: '.65rem 1rem', fontWeight: 500 }}>{s.form_id}</td>
                <td style={{ padding: '.65rem 1rem' }}>
                  {s.projects
                    ? <><strong>{s.projects.project_code}</strong><br/><span style={{ color: 'var(--grey-5)', fontSize: '.8rem' }}>{s.projects.commodity}</span></>
                    : <span style={{ color: 'var(--grey-3)' }}>—</span>
                  }
                </td>
                <td style={{ padding: '.65rem 1rem' }}>{s.country || '—'}</td>
                <td style={{ padding: '.65rem 1rem', color: 'var(--grey-5)' }}>{s.submitted_at ? fmt(s.submitted_at) : '—'}</td>
                <td style={{ padding: '.65rem 1rem' }}>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </td>
                <td style={{ padding: '.65rem 1rem', textAlign: 'right' }}>
                  <span style={{ color: 'var(--blue)', fontSize: '.8rem' }}>Review →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '.5rem', marginTop: '1rem' }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => nav({ page: String(page - 1) })}>← Prev</button>
          <span style={{ padding: '.45rem .75rem', fontSize: '.875rem', color: 'var(--grey-5)' }}>
            Page {page} of {totalPages}
          </span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => nav({ page: String(page + 1) })}>Next →</button>
        </div>
      )}
    </div>
  )
}
