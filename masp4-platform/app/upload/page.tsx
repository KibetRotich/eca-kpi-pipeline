'use client'

import { useState, useRef } from 'react'

const FORM_IDS = [
  'FarmerProfile','ServiceProviderProfile','CSOProfile','CompanyProfile',
  'S61','S62','S21Farmer','S21SP','S25','S63','S64','S65',
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i)

export default function UploadPage() {
  const fileRef    = useRef<HTMLInputElement>(null)
  const [year,     setYear]     = useState(String(currentYear))
  const [formId,   setFormId]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Select a CSV file first.'); return }

    setLoading(true)
    setResult(null)
    setError(null)

    const fd = new FormData()
    fd.append('file',        file)
    fd.append('survey_year', year)
    if (formId) fd.append('form_id', formId)

    try {
      const res  = await fetch('/api/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.')
      } else {
        setResult(json)
      }
    } catch {
      setError('Network error — check the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Import ODK / Taro CSV</h1>

      {/* Instructions */}
      <div style={{
        background: 'var(--blue-l)', borderRadius: 'var(--radius)',
        padding: '1rem 1.1rem', marginBottom: '1.5rem', fontSize: '.875rem', lineHeight: 1.6,
      }}>
        <strong>Before uploading:</strong>
        <ul style={{ marginTop: '.35rem', paddingLeft: '1.25rem' }}>
          <li>Export the form data as CSV from ODK Central or Taro</li>
          <li>Ensure the CSV has a <code>_uuid</code>, <code>_project_code</code>, and <code>_country</code> column</li>
          <li>Each row becomes one pending submission in the review queue</li>
          <li>Profile submissions must be approved before linked survey forms</li>
        </ul>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* File picker */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '.875rem', marginBottom: '.35rem' }}>
            CSV file
          </label>
          <div
            style={{
              border: '2px dashed var(--grey-2)', borderRadius: 'var(--radius)',
              padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
              background: fileName ? 'var(--green-l)' : '#fff',
              color: fileName ? 'var(--green)' : 'var(--grey-5)',
            }}
            onClick={() => fileRef.current?.click()}
          >
            {fileName
              ? <><strong>{fileName}</strong><br/><span style={{ fontSize: '.8rem' }}>Click to change</span></>
              : <><strong>Click to select file</strong><br/><span style={{ fontSize: '.8rem' }}>or drag and drop a .csv file<br/>(max 10 MB)</span></>
            }
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </div>

        {/* Survey year */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '.875rem', marginBottom: '.35rem' }}>
            Survey year
          </label>
          <select value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%' }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Form type (optional override) */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '.875rem', marginBottom: '.35rem' }}>
            Form type <span style={{ fontWeight: 400, color: 'var(--grey-3)' }}>(auto-detected if left blank)</span>
          </label>
          <select value={formId} onChange={e => setFormId(e.target.value)} style={{ width: '100%' }}>
            <option value="">Auto-detect from column headers</option>
            {FORM_IDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '.65rem' }}>
          {loading ? 'Uploading…' : 'Upload and stage submissions'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{
          marginTop: '1rem', background: 'var(--red-l)', color: 'var(--red)',
          padding: '.75rem 1rem', borderRadius: 'var(--radius)', fontSize: '.875rem',
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{
            background: result.inserted > 0 ? 'var(--green-l)' : 'var(--amber-l)',
            color:      result.inserted > 0 ? 'var(--green)'   : 'var(--amber)',
            padding: '1rem', borderRadius: 'var(--radius)', fontSize: '.875rem',
          }}>
            <strong>{result.inserted} submission{result.inserted !== 1 ? 's' : ''} staged</strong>
            {result.skipped > 0 && <span style={{ marginLeft: '.75rem', opacity: .8 }}>{result.skipped} skipped (duplicates or missing project)</span>}
          </div>

          {result.errors.length > 0 && (
            <div style={{
              marginTop: '.75rem', background: 'var(--red-l)', color: 'var(--red)',
              padding: '.75rem 1rem', borderRadius: 'var(--radius)', fontSize: '.8rem',
            }}>
              <strong>Errors:</strong>
              <ul style={{ paddingLeft: '1.1rem', marginTop: '.35rem' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {result.inserted > 0 && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <a href="/submissions">
                <button className="btn-primary">Go to Review Queue →</button>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
