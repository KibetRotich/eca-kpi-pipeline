/**
 * Evaluation Insights — shared constants and types (Sprint 47).
 * Safe to import from client and server code (no secrets, no server-only imports).
 */

import { COMMODITIES, type ThemeChart } from '@/lib/themes'

/** Only signed-in accounts on this domain may upload reports. */
export const STAFF_DOMAIN = 'solidaridadnetwork.org'

export function isStaffEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(`@${STAFF_DOMAIN}`)
}

export const EVAL_COUNTRIES = ['Ethiopia', 'Kenya', 'Tanzania', 'Uganda', 'Regional (ECA)'] as const

export const EVAL_TAGS = [
  'Baseline', 'Midline', 'Endline', 'Impact evaluation', 'Thematic study', 'Learning review',
  'Gender & inclusion', 'Youth', 'Climate & environment', 'Income & livelihoods',
  'Market access', 'Finance', 'Policy & governance', 'Decent work',
] as const

export const PROGRAMME_OTHER = 'Programme-wide / other'

/** Commodities a study can cover (Sprint 52); the same list as the theme scorecards. None = programme-wide. */
export const EVAL_COMMODITIES = COMMODITIES

/**
 * Reads a Google Drive / Google Docs share link and returns the file id, the canonical link stored as
 * source_url, and the file type when the link itself reveals it (Google Docs). Null for anything that is
 * not a link to a single Drive file or Google Doc (folders, Sheets, Slides, other sites).
 */
export function parseDriveLink(raw: string): { id: string; url: string; type: 'gdoc' | null } | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  const ID = /^[A-Za-z0-9_-]{20,}$/

  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([^/]+)/)
    return m && ID.test(m[1]) ? { id: m[1], url: `https://docs.google.com/document/d/${m[1]}/edit`, type: 'gdoc' } : null
  }
  if (u.hostname === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/)
    const id = m?.[1] ?? ((u.pathname === '/open' || u.pathname === '/uc') ? u.searchParams.get('id') : null)
    return id && ID.test(id) ? { id, url: `https://drive.google.com/file/d/${id}/view`, type: null } : null
  }
  return null
}

/** 'queued' = waiting for a summary (no ANTHROPIC_API_KEY: summaries are written from Claude Code instead). */
export type EvaluationStatus = 'uploading' | 'queued' | 'processing' | 'draft' | 'failed' | 'published' | 'rejected'

export type EvaluationFileType = 'pdf' | 'docx' | 'gdoc'

export const FILE_TYPE_LABEL: Record<EvaluationFileType, string> = { pdf: 'PDF', docx: 'Word', gdoc: 'Google Doc' }

/**
 * What the summarisation pipeline stores in evaluation_reports.summary.
 * `charts` (optional) chart the study's own figures; each row's `source` is the study's id.
 */
export interface EvaluationSummary {
  headline: string
  overview: string
  key_findings: string[]
  recommendations: string[]
  lessons_learned: string[]
  methodology: string
  limitations: string[]
  charts?: ThemeChart[]
}

export interface EvaluationReport {
  id: string
  title: string
  programme: string
  country: string
  period_start: string | null
  period_end: string | null
  tags: string[]
  commodities: string[]
  file_name: string
  file_type: EvaluationFileType
  source_url: string | null   // the report in Google Drive (studies linked rather than uploaded)
  evaluator: string | null
  review_note: string | null  // points the reviewer should check (conflicting figures, draft report, partial read)
  uploaded_by: string
  uploaded_at: string
  status: EvaluationStatus
  summary: EvaluationSummary | null
  error: string | null
  published_at: string | null
}

/** "Jan 2025 – Jun 2026", or '' when no period was given. */
export function formatPeriod(start: string | null, end: string | null): string {
  const f = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (start && end) return `${f(start)} – ${f(end)}`
  return start ? `From ${f(start)}` : end ? `To ${f(end)}` : ''
}
