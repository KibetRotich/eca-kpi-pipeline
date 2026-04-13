'use client'

import { useState, useRef } from 'react'

const FORM_IDS = ['FarmerProfile','ServiceProviderProfile','CSOProfile','CompanyProfile','S61','S62','S21Farmer','S21SP','S25','S63','S64','S65']
const currentYear = new Date().getFullYear()
const YEARS = [2026, 2027, 2028, 2029, 2030]

export default function UploadPage() {
  const fileRef   = useRef<HTMLInputElement>(null)
  const [year,    setYear]    = useState(String(currentYear))
  const [formId,  setFormId]  = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [fileName,setFileName]= useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Select a CSV file first.'); return }
    setLoading(true); setResult(null); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('survey_year', year)
    if (formId) fd.append('form_id', formId)
    try {
      const res  = await fetch('/api/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Upload failed.')
      else         setResult(json)
    } catch {
      setError('Network error — check the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Header */}
      <div style={{ marginBottom: '.9rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#111' }}>Import ODK / Taro CSV</div>
        <div style={{ fontSize: '.58rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 2 }}>
          Stage submissions for review
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        background: '#fffce8', border: '1px solid #f0d800', borderLeft: '4px solid #FFC800',
        padding: '.6rem 1rem', marginBottom: '.9rem', fontSize: '.68rem', fontWeight: 600, color: '#555', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#000' }}>Before uploading:</strong>
        <ul style={{ marginTop: '.35rem', paddingLeft: '1.1rem' }}>
          <li>Export form data as CSV from ODK Central or Taro</li>
          <li>CSV must include <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_uuid</code>, <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_project_code</code>, and <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_country</code> columns</li>
          <li>Profile submissions must be approved before linked survey forms</li>
        </ul>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>

        {/* File drop zone */}
        <div>
          <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555', marginBottom: '.35rem' }}>
            CSV file
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${fileName ? '#FFC800' : '#d0d0d0'}`,
              background: fileName ? '#fffce8' : '#fafafa',
              padding: '1.5rem', textAlign: 'center', cursor: 'pointer',
            }}
          >
            {fileName ? (
              <>
                <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#000' }}>{fileName}</div>
                <div style={{ fontSize: '.6rem', color: '#888', marginTop: 4 }}>Click to change</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#555' }}>Click to select .csv file</div>
                <div style={{ fontSize: '.6rem', color: '#aaa', marginTop: 4 }}>Max 10 MB</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFileName(e.target.files?.[0]?.name ?? null)} />
        </div>

        {/* Survey year */}
        <div>
          <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555', marginBottom: '.35rem' }}>
            Survey year
          </label>
          <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
            <select value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%', paddingRight: '1.4rem' }}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
          </div>
        </div>

        {/* Form type */}
        <div>
          <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555', marginBottom: '.35rem' }}>
            Form type <span style={{ fontWeight: 400, color: '#aaa' }}>(auto-detected if blank)</span>
          </label>
          <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
            <select value={formId} onChange={e => setFormId(e.target.value)} style={{ width: '100%', paddingRight: '1.4rem' }}>
              <option value="">Auto-detect from column headers</option>
              {FORM_IDS.map(f => <option key={f}>{f}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '.55rem', width: '100%', fontSize: '.65rem' }}>
          {loading ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2, verticalAlign: 'middle', marginRight: 6 }} />Uploading…</> : 'Upload and stage submissions'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div style={{ marginTop: '.8rem', background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828', padding: '.65rem .9rem', fontSize: '.7rem' }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: '.8rem' }}>
          <div style={{
            background: result.inserted > 0 ? '#fffce8' : '#fff8e1',
            border: '1px solid #FFC800', borderLeft: '4px solid #FFC800',
            padding: '.75rem .9rem', fontSize: '.7rem', fontWeight: 600,
          }}>
            <strong style={{ fontSize: '.8rem' }}>{result.inserted} submission{result.inserted !== 1 ? 's' : ''} staged</strong>
            {result.skipped > 0 && <span style={{ color: '#888', marginLeft: '.75rem' }}>{result.skipped} skipped</span>}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: '.5rem', background: '#ffebee', border: '1px solid #ef9a9a', padding: '.65rem .9rem', fontSize: '.65rem', color: '#c62828' }}>
              <strong>Errors:</strong>
              <ul style={{ paddingLeft: '1rem', marginTop: '.3rem' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {result.inserted > 0 && (
            <div style={{ marginTop: '.75rem' }}>
              <a href="/submissions"><button className="btn-primary" style={{ width: '100%', padding: '.5rem' }}>Go to Review Queue →</button></a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
