/**
 * POST /api/submissions/[id]/approve
 *
 * Body (JSON):
 *   reviewer_id  — platform_users.id of the data officer approving
 *   notes        — optional review note
 *
 * On approval:
 *   1. Fetches the odk_submission + project info
 *   2. Dispatches to the correct normalizer based on form_id
 *   3. Writes the normalised record to the target table
 *   4. Updates odk_submissions.status → 'approved' + linked_record_id
 *   5. Returns the created record id
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeFarmerProfile }          from '@/lib/normalizers/farmer-profile'
import { normalizeServiceProviderProfile } from '@/lib/normalizers/service-provider-profile'
import { normalizeCSOProfile }             from '@/lib/normalizers/cso-profile'
import { normalizeCompanyProfile }         from '@/lib/normalizers/company-profile'
import { normalizeS61 }                    from '@/lib/normalizers/s61'
import { normalizeS62 }                    from '@/lib/normalizers/s62'
import { normalizeS21Farmer, normalizeS21SP } from '@/lib/normalizers/s21'
import { normalizeS63, normalizeS64, normalizeS65 } from '@/lib/normalizers/s63-s65'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: submissionId } = await params
  const body = await req.json().catch(() => ({}))
  const reviewerId = body.reviewer_id as string | undefined
  const notes      = body.notes      as string | undefined

  // ── 1. Fetch the submission ──────────────────────────────────────────────
  const { data: sub, error: fetchError } = await supabaseAdmin
    .from('odk_submissions')
    .select('*, projects(id, project_code)')
    .eq('id', submissionId)
    .single()

  if (fetchError || !sub) {
    return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
  }
  if (sub.status === 'approved') {
    return NextResponse.json({ error: 'Already approved.' }, { status: 409 })
  }

  const projectId   = sub.projects?.id
  const raw         = sub.raw_data as Record<string, unknown>
  const surveyYear  = (raw._survey_year as number) ?? new Date().getFullYear()
  const formId      = sub.form_id as string

  if (!projectId) {
    return NextResponse.json({ error: 'Submission has no linked project.' }, { status: 422 })
  }

  // ── 2. Normalise ─────────────────────────────────────────────────────────
  let linkedRecordId: string

  try {
    switch (formId) {
      case 'FarmerProfile':
        linkedRecordId = await normalizeFarmerProfile(raw, projectId, submissionId, surveyYear)
        break

      case 'ServiceProviderProfile':
        linkedRecordId = await normalizeServiceProviderProfile(raw, projectId, submissionId, surveyYear)
        break

      case 'CSOProfile':
        linkedRecordId = await normalizeCSOProfile(raw, projectId, submissionId, surveyYear)
        break

      case 'CompanyProfile':
        linkedRecordId = await normalizeCompanyProfile(raw, projectId, submissionId, surveyYear)
        break

      case 'S61': {
        const farmerId = await resolveFarmerId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS61(raw, projectId, submissionId, surveyYear, farmerId)
        break
      }

      case 'S62': {
        const farmerId = await resolveFarmerId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS62(raw, projectId, submissionId, surveyYear, farmerId)
        break
      }

      case 'S21Farmer': {
        const farmerId = await resolveFarmerId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS21Farmer(raw, projectId, submissionId, surveyYear, farmerId)
        break
      }

      case 'S21SP': {
        const spId = await resolveSpId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS21SP(raw, projectId, submissionId, surveyYear, spId)
        break
      }

      case 'S63': {
        const csoId = await resolveCsoId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS63(raw, projectId, submissionId, surveyYear, csoId)
        break
      }

      case 'S64': {
        const companyId = await resolveCompanyId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS64(raw, projectId, submissionId, surveyYear, companyId)
        break
      }

      case 'S65': {
        const companyId = await resolveCompanyId(raw, projectId, surveyYear)
        linkedRecordId = await normalizeS65(raw, projectId, submissionId, surveyYear, companyId)
        break
      }

      default:
        return NextResponse.json({ error: `Unknown form_id: ${formId}` }, { status: 422 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Normalisation failed: ${err.message}` }, { status: 422 })
  }

  // ── 3. Mark submission as approved ────────────────────────────────────────
  const { error: updateError } = await supabaseAdmin
    .from('odk_submissions')
    .update({
      status:           'approved',
      reviewed_by:      reviewerId ?? null,
      reviewed_at:      new Date().toISOString(),
      review_notes:     notes ?? null,
      linked_record_id: linkedRecordId,
    })
    .eq('id', submissionId)

  if (updateError) {
    return NextResponse.json({ error: `Approval update failed: ${updateError.message}` }, { status: 500 })
  }

  return NextResponse.json({ approved: true, linked_record_id: linkedRecordId })
}

// ── Helpers: resolve existing profile IDs from submission raw data ────────────
// Survey forms (S61, S62, etc.) include the farmer's national_id or farmer_uid
// so we can link them to a previously approved FarmerProfile record.

async function resolveFarmerId(
  raw: Record<string, unknown>,
  projectId: string,
  surveyYear: number,
): Promise<string> {
  const nationalId = raw.f_profile_id_national as string | undefined
  const farmerUid  = raw.f_profile_id_farmer   as string | undefined

  let query = supabaseAdmin
    .from('farmer_profiles')
    .select('id')
    .eq('project_id', projectId)
    .eq('survey_year', surveyYear)

  if (farmerUid)  query = query.eq('farmer_uid', farmerUid)
  else if (nationalId) query = query.eq('national_id', nationalId)
  else throw new Error('Survey row has no farmer_uid or national_id for linking.')

  const { data, error } = await query.single()
  if (error || !data) {
    throw new Error(
      `No approved FarmerProfile found for farmer_uid="${farmerUid}" / national_id="${nationalId}". ` +
      `Approve the FarmerProfile submission first.`
    )
  }
  return data.id
}

async function resolveSpId(
  raw: Record<string, unknown>,
  projectId: string,
  surveyYear: number,
): Promise<string> {
  const name = raw.sp_name as string | undefined
  if (!name) throw new Error('SP survey row is missing sp_name for linking.')

  const { data, error } = await supabaseAdmin
    .from('service_provider_profiles')
    .select('id')
    .eq('project_id', projectId)
    .eq('survey_year', surveyYear)
    .eq('sp_name', name)
    .single()

  if (error || !data) {
    throw new Error(`No approved ServiceProviderProfile found for sp_name="${name}". Approve the profile first.`)
  }
  return data.id
}

async function resolveCsoId(
  raw: Record<string, unknown>,
  projectId: string,
  surveyYear: number,
): Promise<string> {
  const name = raw.cso_name as string | undefined
  if (!name) throw new Error('CSO survey row is missing cso_name for linking.')

  const { data, error } = await supabaseAdmin
    .from('cso_profiles')
    .select('id')
    .eq('project_id', projectId)
    .eq('survey_year', surveyYear)
    .eq('cso_name', name)
    .single()

  if (error || !data) {
    throw new Error(`No approved CSOProfile found for cso_name="${name}". Approve the profile first.`)
  }
  return data.id
}

async function resolveCompanyId(
  raw: Record<string, unknown>,
  projectId: string,
  surveyYear: number,
): Promise<string> {
  const name = raw.c_name as string | undefined
  if (!name) throw new Error('Company survey row is missing c_name for linking.')

  const { data, error } = await supabaseAdmin
    .from('company_profiles')
    .select('id')
    .eq('project_id', projectId)
    .eq('survey_year', surveyYear)
    .eq('company_name', name)
    .single()

  if (error || !data) {
    throw new Error(`No approved CompanyProfile found for company_name="${name}". Approve the profile first.`)
  }
  return data.id
}
