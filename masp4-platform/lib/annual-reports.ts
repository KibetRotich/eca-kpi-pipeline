/**
 * Annual Reports — shared constants and types (Sprint 61).
 * Safe to import from client and server code (no secrets, no server-only imports).
 * Countries, staff check and Drive-link parsing are shared with Evaluation Insights.
 */

export { EVAL_COUNTRIES as REPORT_COUNTRIES, PROGRAMME_OTHER, isStaffEmail, parseDriveLink } from '@/lib/evaluations'

export type AnnualReportType = 'donor' | 'country'

export const REPORT_TYPE_LABEL: Record<AnnualReportType, string> = {
  donor: 'Donor report',
  country: 'Country / ECA report',
}

export type AnnualReportFileType = 'pdf' | 'docx' | 'gdoc'

export interface AnnualReport {
  id: string
  title: string
  report_type: AnnualReportType
  programme: string
  country: string
  year: number
  period_label: string | null
  source_url: string
  file_type: AnnualReportFileType
}

export const MIN_REPORT_YEAR = 2015
