'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

/** Downloads the currently-filtered events as CSV from /api/eca-events/export (server-side, staff only). */
export default function ExportButton() {
  const sp = useSearchParams()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(`/api/eca-events/export?${sp.toString()}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `eca-events_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn-secondary" onClick={run} disabled={busy}
      title="Download the currently-filtered events (PII-free) as CSV">
      {busy ? 'Exporting…' : '⬇ Export CSV'}
    </button>
  )
}
