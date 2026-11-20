/**
 * /annual-plans — Annual Plans & Budgets library (Sprint 69).
 *
 * Sub-tabs (?tab=):
 *   plans (default) — workplans / annual plans, combined workplan + budget files, and supporting documents
 *   budgets         — budgets / financial plans and combined workplan + budget files
 * Each sub-tab has a List view and a Coverage view (?view=coverage): one row per programme, one column per year,
 * showing Final / Draft only / Missing from the registered files. Nothing is read from Google Drive here; rows live in
 * public.annual_plans. All signed-in staff see every row (budgets included) and can add files; M&E Officers / Admins
 * can remove a wrong link.
 */
import { supabaseAdmin } from '@/lib/supabase'
import type { AnnualPlan, PlanSubTab } from '@/lib/annual-plans'
import styles from './plans.module.css'
import AddPlan from './AddPlan'
import PlanBrowser from './PlanBrowser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Annual Plans & Budgets — ECA PMEL Platform',
}

type Search = Promise<{ [key: string]: string | string[] | undefined }>

export default async function AnnualPlansPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams
  const tab: PlanSubTab = sp.tab === 'budgets' ? 'budgets' : 'plans'
  const view = sp.view === 'coverage' ? 'coverage' : 'list'

  const { data } = await supabaseAdmin
    .from('annual_plans')
    .select('id, title, scope, doc_kind, status, programme, country, plan_year, period_label, drive_file_id, source_url, file_type')
    .order('plan_year', { ascending: false })
    .order('scope', { ascending: false })
    .order('programme')
    .order('title')
  const plans = (data ?? []) as AnnualPlan[]

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Annual Plans &amp; Budgets</h1>
          <p className={styles.intro}>
            {tab === 'plans'
              ? 'Project and regional (REC ECA) annual plans and workplans. Coverage shows which years have a final plan, only a draft, or none.'
              : 'Project and regional budgets and financial plans. Files that hold both a workplan and a budget appear under Plans and Budgets.'}
            {' '}Each file opens in Google Drive; if Drive asks for access, request it from the M&amp;E team.
          </p>
        </div>
        <AddPlan tab={tab} />
      </header>

      <nav className={styles.tabs} aria-label="Annual Plans & Budgets sections">
        <a href="/annual-plans" className={tab === 'plans' ? styles.tabOn : undefined} aria-current={tab === 'plans' ? 'page' : undefined}>Plans</a>
        <a href="/annual-plans?tab=budgets" className={tab === 'budgets' ? styles.tabOn : undefined} aria-current={tab === 'budgets' ? 'page' : undefined}>Budgets</a>
      </nav>

      {plans.length === 0
        ? <div className={styles.empty}>No annual plans or budgets have been added yet.</div>
        : <PlanBrowser key={tab} plans={plans} tab={tab} initialView={view} />}
    </div>
  )
}
