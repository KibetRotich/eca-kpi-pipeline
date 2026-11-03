/**
 * /annual-reports — Annual Reports library (Sprint 61).
 *
 * A list of links to donor and country annual reports kept in the ECA M&E shared drive, newest year first,
 * with filters. No summaries: each entry opens the report in Google Drive. Signed-in staff add a report with
 * "Add Report" (a Drive link + details); M&E Officers / Admins can remove a wrong link.
 */
import { supabaseAdmin } from '@/lib/supabase'
import type { AnnualReport } from '@/lib/annual-reports'
import styles from './annual.module.css'
import AddReport from './AddReport'
import ReportBrowser from './ReportBrowser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Annual Reports — ECA PMEL Platform',
}

export default async function AnnualReportsPage() {
  const { data } = await supabaseAdmin
    .from('annual_reports')
    .select('id, title, report_type, programme, country, year, period_label, source_url, file_type')
    .order('year', { ascending: false })
    .order('programme')
    .order('title')
  const reports = (data ?? []) as AnnualReport[]

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Annual Reports</h1>
          <p className={styles.intro}>
            Donor and country annual reports from ECA projects and programmes. Each report opens in Google Drive;
            if Drive asks for access, request it from the M&amp;E team.
          </p>
        </div>
        <AddReport />
      </header>

      {reports.length === 0 ? (
        <div className={styles.empty}>No annual reports have been added yet.</div>
      ) : (
        <ReportBrowser reports={reports} />
      )}
    </div>
  )
}
