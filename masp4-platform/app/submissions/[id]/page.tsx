/**
 * /submissions/[id] — Submission detail + review panel
 */

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import ReviewPanel from './ReviewPanel'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// Field display names for common ODK fields
const FIELD_LABELS: Record<string, string> = {
  f_profile_profile_name:   'Full name',
  f_profile_id_national:    'National ID',
  f_profile_id_farmer:      'Farmer UID',
  f_profile_age:            'Age',
  f_profile_gender:         'Gender',
  f_profile_education:      'Education',
  f_profile_hh_size:        'Household size',
  f_profile_primary_commodity: 'Primary commodity',
  f_profile_land_holding:   'Land type',
  sp_name:                  'SP name',
  sp_type:                  'SP type',
  cso_name:                 'CSO name',
  c_name:                   'Company name',
  f_S61_membership_score:   'Collective membership (0–5)',
  f_S61_decision:           'Decision-making (0–5)',
  f_S61_income_expenses:    'Cover major expenses (0–5)',
  f_S61_income_savings:     'Savings buffer (0–5)',
  f_S61_income_sources:     'Income diversification (0–5)',
  f_S61_income_shocks:      'Shocks experienced',
  f_S61_income_recover:     'Shock recovery (2–5)',
  f_S62_yield:              'Yield',
  f_S62_yield_unit:         'Yield unit',
  f_S62_yield_increased:    'Yield increased?',
  f_S62_markets:            'Market access (0–5)',
  f_S63_entity:             'Targeted entity',
  f_S63_framework_progress: 'Progress tier',
  f_S64_reward:             'Directly rewards farmers?',
  f_S64_reward_farmers:     'Farmers rewarded',
  f_S65_progress:           'Progress tier',
  _survey_year:             'Survey year',
  _country:                 'Country',
  _project_code:            'Project code',
}

function label(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/^[a-z]+_/, '').replace(/_/g, ' ')
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export default async function SubmissionDetailPage({ params }: Props) {
  const { id } = await params

  const { data: sub, error } = await supabaseAdmin
    .from('odk_submissions')
    .select('*, projects(project_code, project_name, country, commodity)')
    .eq('id', id)
    .single()

  if (error || !sub) notFound()

  const raw = (sub.raw_data ?? {}) as Record<string, unknown>

  // Separate meta fields from form fields
  const metaKeys  = ['_survey_year', '_country', '_project_code', '_submission_time']
  const formKeys  = Object.keys(raw).filter(k => !metaKeys.includes(k))

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem', fontSize: '.875rem', color: 'var(--grey-5)' }}>
        <a href="/submissions">← Review Queue</a>
        <span style={{ margin: '0 .5rem' }}>·</span>
        <span>{sub.form_id}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left: data preview */}
        <div>
          {/* Metadata card */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '1.25rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Submission metadata</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
              <tbody>
                {[
                  ['Form type',   sub.form_id],
                  ['Status',      sub.status],
                  ['Project',     sub.projects ? `${sub.projects.project_code} — ${sub.projects.project_name}` : '—'],
                  ['Country',     sub.country],
                  ['Submitted',   sub.submitted_at ? new Date(sub.submitted_at).toLocaleString('en-GB') : '—'],
                  ['Imported',    sub.imported_at  ? new Date(sub.imported_at).toLocaleString('en-GB')  : '—'],
                  ['Survey year', raw._survey_year ?? '—'],
                  ['UUID',        sub.submission_uuid],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--grey-1)' }}>
                    <td style={{ padding: '.45rem .5rem', color: 'var(--grey-5)', fontWeight: 500, width: '40%' }}>{k}</td>
                    <td style={{ padding: '.45rem .5rem' }}>
                      {k === 'Status'
                        ? <span className={`badge badge-${sub.status}`}>{sub.status}</span>
                        : renderValue(v)
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Form data card */}
          <div style={{ background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Form responses</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.875rem' }}>
              <tbody>
                {formKeys.map(k => (
                  <tr key={k} style={{ borderBottom: '1px solid var(--grey-1)' }}>
                    <td style={{ padding: '.4rem .5rem', color: 'var(--grey-5)', fontWeight: 500, width: '45%', verticalAlign: 'top' }}>
                      {label(k)}
                      <div style={{ fontSize: '.7rem', color: 'var(--grey-3)', fontWeight: 400 }}>{k}</div>
                    </td>
                    <td style={{ padding: '.4rem .5rem', verticalAlign: 'top' }}>
                      {raw[k] === null || raw[k] === undefined
                        ? <span style={{ color: 'var(--grey-3)' }}>—</span>
                        : renderValue(raw[k])
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: review panel */}
        <ReviewPanel
          submissionId={sub.id}
          status={sub.status}
          reviewNotes={sub.review_notes}
          linkedRecordId={sub.linked_record_id}
          formId={sub.form_id}
        />
      </div>
    </div>
  )
}
