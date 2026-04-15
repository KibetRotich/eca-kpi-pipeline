'use client'

import { useState, useRef } from 'react'

const FORM_IDS = ['FarmerProfile','ServiceProviderProfile','CSOProfile','CompanyProfile','S61','S62','S21Farmer','S21SP','S25','S63','S64','S65']
const currentYear = new Date().getFullYear()
const YEARS = [2026, 2027, 2028, 2029, 2030]

const BLACK  = '#111'
const YELLOW = '#FFC800'

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
    <div>

      {/* Header */}
      <div style={{ marginBottom: '.9rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: BLACK }}>Import CSV</div>
        <div style={{ fontSize: '.58rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.8px', marginTop: 2 }}>
          Download the KoboToolbox form · deploy to enumerators · export CSV · upload here
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', alignItems: 'start' }}>

        {/* ── Left: KoboToolbox form + survey steps ── */}
        <div>

          {/* Download card */}
          <div className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>
            <div style={{ background: BLACK, color: '#fff', padding: '.5rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Step 1 — Download &amp; Deploy KoboToolbox Form
            </div>
            <div style={{ padding: '.8rem .9rem', display: 'flex', gap: '1.2rem', alignItems: 'flex-start' }}>
              <a
                href="/MASP_IV_Kobo_Form_V1.1.xlsx"
                download
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, background: BLACK, color: YELLOW, textDecoration: 'none',
                  padding: '.9rem 1.2rem', minWidth: 110, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>↓</div>
                <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', marginTop: '.35rem' }}>
                  Kobo Form
                </div>
                <div style={{ fontSize: '.5rem', color: '#aaa', marginTop: '.2rem' }}>V1.1 · XLSForm</div>
              </a>
              <div style={{ fontSize: '.68rem', color: '#555', lineHeight: 1.7 }}>
                The <strong>MASP IV Farmer Survey V1.1</strong> covers S6.1, S6.2, S2.1, and S2.5 in one interview.
                Compatible with <strong>KoboToolbox</strong> and ODK Central. Upload the .xlsx file to your
                KoboToolbox account to deploy it to enumerators' mobile devices.
                <div style={{ marginTop: '.5rem', padding: '.4rem .6rem', background: '#fff3e0', border: '1px solid #ffcc80', fontSize: '.62rem', color: '#6d4c00' }}>
                  <strong>Note:</strong> Separate forms for CSO (S6.3) and Company (S6.4/S6.5) respondents are under development (V1.2).
                </div>
              </div>
            </div>
          </div>

          {/* Deployment checklist */}
          <div className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>
            <div style={{ background: '#1a3557', color: '#fff', padding: '.5rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Step 2 — Before Deploying to Enumerators
            </div>
            <div style={{ padding: '.7rem .9rem' }}>
              {[
                ['_project_code', 'Set the project code to exactly match the code in the Projects table (e.g. KE-ANK-001). Wrong codes will cause import failures.'],
                ['_country', 'Confirm enumerators select the correct country value from the dropdown. Accepted: Kenya, Uganda, Tanzania, Ethiopia.'],
                ['GPS', 'Enable GPS on all enumerator devices before the first interview. The form records farm location automatically.'],
                ['Pilot test', 'Run 3–5 pilot interviews before full deployment. Export the pilot CSV and check it imports cleanly before proceeding.'],
                ['Sampling frame', 'Enter the target population in Targets & Achievements first (target_total and gender disaggregation) so the extrapolation formula has a denominator.'],
              ].map(([label, desc]) => (
                <div key={label as string} style={{ display: 'flex', gap: '.7rem', paddingBottom: '.55rem', marginBottom: '.55rem', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ flexShrink: 0, background: YELLOW, color: BLACK, fontSize: '.52rem', fontWeight: 800, padding: '.1rem .4rem', height: 'fit-content', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '.65rem', color: '#555', lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Export & upload steps */}
          <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#2e7d32', color: '#fff', padding: '.5rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Step 3 — Export from KoboToolbox &amp; Upload Here
            </div>
            <div style={{ padding: '.7rem .9rem', fontSize: '.65rem', color: '#555', lineHeight: 1.8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem' }}>
                <div>
                  <div style={{ fontWeight: 800, color: BLACK, marginBottom: '.3rem' }}>Export from KoboToolbox</div>
                  <ol style={{ paddingLeft: '1rem', margin: 0 }}>
                    <li>Open your project in KoboToolbox</li>
                    <li>Go to <em>Data → Downloads</em></li>
                    <li>Select <strong>CSV</strong> format, all fields</li>
                    <li>Click <em>Export</em> and download the file</li>
                  </ol>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: BLACK, marginBottom: '.3rem' }}>Upload on this page</div>
                  <ol style={{ paddingLeft: '1rem', margin: 0 }}>
                    <li>Select the CSV file using the form on the right</li>
                    <li>Choose the correct survey year</li>
                    <li>Leave form type as <em>Auto-detect</em> for KoboToolbox exports</li>
                    <li>Click <em>Upload</em> — submissions enter review queue</li>
                  </ol>
                </div>
              </div>
              <div style={{ marginTop: '.7rem', background: '#fffce8', border: '1px solid #f0d800', borderLeft: '4px solid #FFC800', padding: '.5rem .7rem', fontSize: '.62rem', fontWeight: 600, color: '#555' }}>
                <strong style={{ color: '#000' }}>Required CSV columns:</strong>{' '}
                <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_uuid</code>,{' '}
                <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_project_code</code>,{' '}
                <code style={{ background: '#f5f5f5', padding: '0 3px' }}>_country</code>.
                Profile submissions (FarmerProfile) must be approved before linked survey forms (S61, S62, etc.) can be imported.
              </div>
            </div>
          </div>

        </div>

        {/* ── Right: Upload form ── */}
        <div>
          <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#e65100', color: '#fff', padding: '.5rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Step 4 — Upload CSV File
            </div>
            <div style={{ padding: '.9rem' }}>
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '.8rem' }}>

                {/* File drop zone */}
                <div>
                  <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555', marginBottom: '.35rem' }}>
                    CSV file
                  </label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${fileName ? YELLOW : '#d0d0d0'}`,
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
                  <div style={{ position: 'relative' }}>
                    <select value={year} onChange={e => setYear(e.target.value)} style={{ width: '100%', paddingRight: '1.4rem' }}>
                      {YEARS.map(y => <option key={y} value={y}>{y}{y === 2026 ? ' (Baseline)' : ''}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
                  </div>
                </div>

                {/* Form type */}
                <div>
                  <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555', marginBottom: '.35rem' }}>
                    Form type <span style={{ fontWeight: 400, color: '#aaa' }}>(auto-detected if blank)</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select value={formId} onChange={e => setFormId(e.target.value)} style={{ width: '100%', paddingRight: '1.4rem' }}>
                      <option value="">Auto-detect from column headers</option>
                      {FORM_IDS.map(f => <option key={f}>{f}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#888', pointerEvents: 'none' }}>▾</span>
                  </div>
                </div>

                <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '.55rem', width: '100%', fontSize: '.65rem' }}>
                  {loading
                    ? <><span className="spin" style={{ width: 12, height: 12, borderWidth: 2, verticalAlign: 'middle', marginRight: 6 }} />Uploading…</>
                    : 'Upload and stage submissions'}
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
          </div>

        </div>

      </div>
    </div>
  )
}
