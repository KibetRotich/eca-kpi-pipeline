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
  drive_file_id: string
  source_url: string
  file_type: AnnualReportFileType
}

/**
 * The link a report opens with. Drive's file preview (/file/d/<id>/view) often shows a blank page for
 * Word files, so .docx reports open in Google Docs' Office viewer instead (rtpof=true keeps the file as .docx).
 * PDFs and Google Docs use their stored link.
 */
export function reportOpenUrl(r: Pick<AnnualReport, 'drive_file_id' | 'source_url' | 'file_type'>): string {
  return r.file_type === 'docx'
    ? `https://docs.google.com/document/d/${r.drive_file_id}/edit?rtpof=true&sd=true`
    : r.source_url
}

export const MIN_REPORT_YEAR = 2015
