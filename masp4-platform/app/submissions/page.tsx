/**
 * /submissions — Review Queue
 * Server component: fetches submissions, renders SubmissionsTable client component.
 */

import { supabaseAdmin } from '@/lib/supabase'
import SubmissionsTable from './SubmissionsTable'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{
    status?:   string
    country?:  string
    form_id?:  string
    page?:     string
  }>
}

const FORM_IDS = [
  'FarmerProfile','ServiceProviderProfile','CSOProfile','CompanyProfile',
  'S61','S62','S21Farmer','S21SP','S25','S63','S64','S65',
]

const COUNTRIES = ['Kenya','Uganda','Tanzania','Ethiopia','Congo']
const STATUSES  = ['pending','approved','rejected','needs_review']

export default async function SubmissionsPage({ searchParams }: Props) {
  const sp      = await searchParams
  const status  = sp.status  ?? 'pending'
  const country = sp.country ?? ''
  const formId  = sp.form_id ?? ''
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10))
  const perPage = 50

  let query = supabaseAdmin
    .from('odk_submissions')
    .select(`
      id, submission_uuid, form_id, country,
      submitted_at, imported_at, status, review_notes,
      raw_data->_survey_year,
      projects ( project_code, project_name, commodity )
    `, { count: 'exact' })
    .eq('status', status)
    .order('submitted_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (country) query = query.eq('country', country)
  if (formId)  query = query.eq('form_id', formId)

  const { data: submissions, count, error } = await query

  // Status counts for tab bar
  const { data: counts } = await supabaseAdmin
    .from('odk_submissions')
    .select('status')

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s] = counts?.filter(r => r.status === s).length ?? 0
    return acc
  }, {} as Record<string, number>)

  return (
    <SubmissionsTable
      submissions={(submissions ?? []) as any[]}
      total={count ?? 0}
      page={page}
      perPage={perPage}
      currentStatus={status}
      currentCountry={country}
      currentFormId={formId}
      statusCounts={statusCounts}
      countries={COUNTRIES}
      formIds={FORM_IDS}
      error={error?.message}
    />
  )
}
