/**
 * /annual-reports — Annual Reports (Sprint 61) with the reporting tracker (Sprint 62).
 *
 * Tabs (?tab=):
 *   tracker (default) — one row per project annual report in a reporting cycle (?cycle=<id>, default the latest):
 *                       responsible staff, internal and donor deadlines, status, and the final report once filed.
 *                       Replaces the Google Doc "PROJECT REPORTING TRACKER".
 *   library           — links to donor and country annual reports in Google Drive, newest year first.
 * Signed-in staff add Library reports with "Add Report"; tracker rows are updated by their responsible staff
 * or M&E Officers / Admins (see /api/report-tracker).
 */
import { supabaseAdmin } from '@/lib/supabase'
import type { AnnualReport } from '@/lib/annual-reports'
import type { LinkedReport, ReportCycle, TrackerProject, TrackerRow } from '@/lib/report-tracker'
import styles from './annual.module.css'
import AddReport from './AddReport'
import ReportBrowser from './ReportBrowser'
import Tracker from './Tracker'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Annual Reports — ECA PMEL Platform',
}

type Search = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AnnualReportsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams
  const tab = sp.tab === 'library' ? 'library' : 'tracker'

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Annual Reports</h1>
          <p className={styles.intro}>
            {tab === 'tracker'
              ? 'Track each project’s annual report from drafting to the donor. When a report is final, its Drive link is filed in the Library.'
              : 'Donor and country annual reports from ECA projects and programmes. Each report opens in Google Drive; if Drive asks for access, request it from the M&E team.'}
          </p>
        </div>
        {tab === 'library' && <AddReport />}
      </header>

      <nav className={styles.tabs} aria-label="Annual Reports sections">
        <a href="/annual-reports" className={tab === 'tracker' ? styles.tabOn : undefined} aria-current={tab === 'tracker' ? 'page' : undefined}>Tracker</a>
        <a href="/annual-reports?tab=library" className={tab === 'library' ? styles.tabOn : undefined} aria-current={tab === 'library' ? 'page' : undefined}>Library</a>
      </nav>

      {tab === 'library' ? <Library /> : <TrackerTab cycleParam={typeof sp.cycle === 'string' ? sp.cycle : undefined} />}
    </div>
  )
}

async function Library() {
  const { data } = await supabaseAdmin
    .from('annual_reports')
    .select('id, title, report_type, programme, country, year, period_label, drive_file_id, source_url, file_type')
    .order('year', { ascending: false })
    .order('programme')
    .order('title')
  const reports = (data ?? []) as AnnualReport[]
  return reports.length === 0
    ? <div className={styles.empty}>No annual reports have been added yet.</div>
    : <ReportBrowser reports={reports} />
}

async function TrackerTab({ cycleParam }: { cycleParam?: string }) {
  const { data: cycleData } = await supabaseAdmin.from('report_cycles').select('id, name, year')
    .order('year', { ascending: false }).order('created_at', { ascending: false })
  const cycles = (cycleData ?? []) as ReportCycle[]
  const cycle = cycles.find(c => c.id === cycleParam) ?? cycles[0] ?? null

  let rows: TrackerRow[] = []
  let reports: LinkedReport[] = []
  if (cycle) {
    const { data } = await supabaseAdmin.from('report_tracker').select('*').eq('cycle_id', cycle.id).order('sort_order')
    rows = (data ?? []) as TrackerRow[]
    const ids = [...new Set(rows.flatMap(r => r.annual_report_ids))]
    if (ids.length) {
      const { data: rep } = await supabaseAdmin.from('annual_reports')
        .select('id, title, source_url, file_type, drive_file_id').in('id', ids)
      reports = (rep ?? []) as LinkedReport[]
    }
  }
  // The projects in Projects' Progress (same list as /api/projects): new cycles and "Add report" use them.
  const { data: projData } = await supabaseAdmin.from('projects')
    .select('id, project_code, project_name, country').eq('active', true).order('project_name')
  const projects = (projData ?? []) as TrackerProject[]
  // Deadlines are judged against today's date in East Africa.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })

  return <Tracker cycles={cycles} cycle={cycle} rows={rows} reports={reports} projects={projects} today={today} />
}
