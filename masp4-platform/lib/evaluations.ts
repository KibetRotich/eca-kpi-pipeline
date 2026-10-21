/**
 * Evaluation Insights — shared constants and types (Sprint 47).
 * Safe to import from client and server code (no secrets, no server-only imports).
 */

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

export const MAX_REPORT_BYTES = 25 * 1024 * 1024   // matches the `reports` bucket limit

export const REPORT_TYPES: Record<string, 'pdf' | 'docx'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

export type EvaluationStatus = 'uploading' | 'processing' | 'draft' | 'failed' | 'published' | 'rejected'

/** What the summarisation pipeline stores in evaluation_reports.summary. */
export interface EvaluationSummary {
  headline: string
  overview: string
  key_findings: string[]
  recommendations: string[]
  lessons_learned: string[]
  methodology: string
  limitations: string[]
}

export interface EvaluationReport {
  id: string
  title: string
  programme: string
  country: string
  period_start: string | null
  period_end: string | null
  tags: string[]
  file_name: string
  file_type: 'pdf' | 'docx'
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
