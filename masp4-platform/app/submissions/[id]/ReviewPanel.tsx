'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  submissionId: string; status: string; reviewNotes: string | null
  linkedRecordId: string | null; formId: string
}

const PROFILE_FORMS = ['FarmerProfile','ServiceProviderProfile','CSOProfile','CompanyProfile']

function profileFor(formId: string) {
  if (['S61','S62','S21Farmer','S25'].includes(formId)) return 'FarmerProfile'
  if (formId === 'S21SP')  return 'ServiceProviderProfile'
  if (formId === 'S63')    return 'CSOProfile'
  return 'CompanyProfile'
}

export default function ReviewPanel({ submissionId, status, reviewNotes, linkedRecordId, formId }: Props) {
  const router = useRouter()
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState<'approve'|'reject'|null>(null)
  const [result,  setResult]  = useState<{ ok: boolean; message: string } | null>(null)

  const isReviewed = status === 'approved' || status === 'rejected'

  async function approve() {
    setLoading('approve'); setResult(null)
    const res  = await fetch(`/api/submissions/${submissionId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes || undefined }) })
    const json = await res.json()
    setLoading(null)
    if (!res.ok) { setResult({ ok: false, message: json.error ?? 'Approval failed.' }) }
    else         { setResult({ ok: true,  message: `Approved — record ${json.linked_record_id.slice(0,8)}…` }); router.refresh() }
  }

  async function reject() {
    if (!notes.trim()) { setResult({ ok: false, message: 'A rejection note is required.' }); return }
    setLoading('reject'); setResult(null)
    const res  = await fetch(`/api/submissions/${submissionId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) })
    const json = await res.json()
    setLoading(null)
    if (!res.ok) { setResult({ ok: false, message: json.error ?? 'Rejection failed.' }) }
    else         { setResult({ ok: true,  message: 'Submission rejected.' }); router.refresh() }
  }

  return (
    <div className="cc" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 56 + 38 + 16 }}>

      {/* Card header */}
      <div style={{ background: '#111', color: '#fff', padding: '.55rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
        Review Decision
      </div>

      <div style={{ padding: '1rem' }}>

        {/* Already reviewed */}
        {isReviewed && (
          <div style={{
            background: status === 'approved' ? '#e8f5e9' : '#ffebee',
            border: `1px solid ${status === 'approved' ? '#a5d6a7' : '#ef9a9a'}`,
            color: status === 'approved' ? '#2e7d32' : '#c62828',
            padding: '.75rem', fontSize: '.7rem', marginBottom: '.9rem',
          }}>
            <div style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: reviewNotes ? '.35rem' : 0 }}>
              {status === 'approved' ? '✓ Approved' : '✗ Rejected'}
            </div>
            {reviewNotes && <div style={{ opacity: .85 }}>{reviewNotes}</div>}
            {linkedRecordId && <div style={{ marginTop: '.3rem', fontSize: '.6rem', opacity: .7, fontFamily: 'monospace' }}>{linkedRecordId}</div>}
          </div>
        )}

        {/* Profile ordering hint */}
        {!PROFILE_FORMS.includes(formId) && !isReviewed && (
          <div style={{
            background: '#fff8e1', border: '1px solid #fcd34d',
            padding: '.6rem .8rem', fontSize: '.65rem', lineHeight: 1.5, marginBottom: '.9rem',
          }}>
            <strong style={{ color: '#b45309' }}>Note:</strong>{' '}
            <span style={{ color: '#555' }}>Approve the matching <strong>{profileFor(formId)}</strong> first — this survey needs an existing profile record to link to.</span>
          </div>
        )}

        {/* Notes + buttons */}
        {!isReviewed && (
          <>
            <label style={{ display: 'block', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#666', marginBottom: '.35rem' }}>
              Review notes {!PROFILE_FORMS.includes(formId) ? '' : '(optional)'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add a note — required for rejection…"
              rows={4}
              style={{ width: '100%', resize: 'vertical', marginBottom: '.75rem', fontSize: '.72rem' }}
            />
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button className="btn-primary"  style={{ flex: 1, padding: '.45rem' }} disabled={loading !== null} onClick={approve}>
                {loading === 'approve' ? <span className="spin" style={{ width: 12, height: 12, borderWidth: 2 }} /> : '✓ Approve'}
              </button>
              <button className="btn-danger"   style={{ flex: 1, padding: '.45rem', fontSize: '.58rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }} disabled={loading !== null} onClick={reject}>
                {loading === 'reject' ? '…' : '✗ Reject'}
              </button>
            </div>
          </>
        )}

        {/* Result */}
        {result && (
          <div style={{
            marginTop: '.75rem', padding: '.6rem .75rem', fontSize: '.68rem',
            background: result.ok ? '#e8f5e9' : '#ffebee',
            border: `1px solid ${result.ok ? '#a5d6a7' : '#ef9a9a'}`,
            color: result.ok ? '#2e7d32' : '#c62828',
          }}>
            {result.message}
          </div>
        )}

        <div style={{ marginTop: '.9rem', paddingTop: '.75rem', borderTop: '1px solid #f0f0f0' }}>
          <a href="/submissions" style={{ fontSize: '.62rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            ← Back to queue
          </a>
        </div>
      </div>
    </div>
  )
}
