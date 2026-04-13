'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  submissionId:   string
  status:         string
  reviewNotes:    string | null
  linkedRecordId: string | null
  formId:         string
}

export default function ReviewPanel({ submissionId, status, reviewNotes, linkedRecordId, formId }: Props) {
  const router = useRouter()
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [result,  setResult]  = useState<{ ok: boolean; message: string } | null>(null)

  const isAlreadyReviewed = status === 'approved' || status === 'rejected'

  async function approve() {
    setLoading('approve')
    setResult(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? 'Approval failed.' })
      } else {
        setResult({ ok: true, message: `Approved. Record created: ${json.linked_record_id}` })
        router.refresh()
      }
    } catch {
      setResult({ ok: false, message: 'Network error.' })
    } finally {
      setLoading(null)
    }
  }

  async function reject() {
    if (!notes.trim()) {
      setResult({ ok: false, message: 'A rejection note is required.' })
      return
    }
    setLoading('reject')
    setResult(null)
    try {
      const res = await fetch(`/api/submissions/${submissionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? 'Rejection failed.' })
      } else {
        setResult({ ok: true, message: 'Submission rejected.' })
        router.refresh()
      }
    } catch {
      setResult({ ok: false, message: 'Network error.' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '1.25rem', position: 'sticky', top: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Review decision</h2>

      {/* Already reviewed */}
      {isAlreadyReviewed && (
        <div style={{
          background: status === 'approved' ? 'var(--green-l)' : 'var(--red-l)',
          color:      status === 'approved' ? 'var(--green)'   : 'var(--red)',
          padding: '.75rem',
          borderRadius: 'var(--radius)',
          fontSize: '.875rem',
          marginBottom: '1rem',
        }}>
          <strong>{status === 'approved' ? 'Approved' : 'Rejected'}</strong>
          {reviewNotes && <p style={{ marginTop: '.35rem', opacity: .85 }}>{reviewNotes}</p>}
          {linkedRecordId && (
            <p style={{ marginTop: '.35rem', fontSize: '.8rem', opacity: .75 }}>
              Record: {linkedRecordId}
            </p>
          )}
        </div>
      )}

      {/* Approval ordering hint */}
      {(formId !== 'FarmerProfile' && formId !== 'ServiceProviderProfile' &&
        formId !== 'CSOProfile' && formId !== 'CompanyProfile') && (
        <div style={{
          background: 'var(--amber-l)',
          color: 'var(--amber)',
          padding: '.65rem .85rem',
          borderRadius: 'var(--radius)',
          fontSize: '.8rem',
          marginBottom: '1rem',
          lineHeight: 1.4,
        }}>
          <strong>Note:</strong> Approve the matching profile submission first —
          this survey form needs an existing {
            ['S61','S62','S21Farmer','S25'].includes(formId) ? 'FarmerProfile' :
            formId === 'S21SP' ? 'ServiceProviderProfile' :
            formId === 'S63'   ? 'CSOProfile' : 'CompanyProfile'
          } record.
        </div>
      )}

      {/* Notes field */}
      {!isAlreadyReviewed && (
        <>
          <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--grey-5)', marginBottom: '.35rem' }}>
            Review notes {formId !== 'FarmerProfile' ? '' : '(optional)'}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add a note (required for rejection)..."
            rows={4}
            style={{ width: '100%', resize: 'vertical', marginBottom: '1rem' }}
          />

          <div style={{ display: 'flex', gap: '.65rem' }}>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={loading !== null}
              onClick={approve}
            >
              {loading === 'approve' ? 'Approving…' : '✓ Approve'}
            </button>
            <button
              className="btn-danger"
              style={{ flex: 1 }}
              disabled={loading !== null}
              onClick={reject}
            >
              {loading === 'reject' ? 'Rejecting…' : '✗ Reject'}
            </button>
          </div>
        </>
      )}

      {/* Result message */}
      {result && (
        <div style={{
          marginTop: '.85rem',
          padding: '.65rem .85rem',
          borderRadius: 'var(--radius)',
          fontSize: '.875rem',
          background: result.ok ? 'var(--green-l)' : 'var(--red-l)',
          color:      result.ok ? 'var(--green)'   : 'var(--red)',
        }}>
          {result.message}
        </div>
      )}

      {/* Back link */}
      <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--grey-2)', paddingTop: '1rem' }}>
        <a href="/submissions" style={{ fontSize: '.875rem', color: 'var(--grey-5)' }}>
          ← Back to queue
        </a>
      </div>
    </div>
  )
}
