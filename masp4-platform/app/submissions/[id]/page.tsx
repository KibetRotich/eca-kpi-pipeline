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
      <div style={{ marginBottom: '.8rem', fontSize: '.62rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>
        <a href="/submissions" style={{ color: '#888' }}>← Review Queue</a>
        <span style={{ margin: '0 .5rem' }}>·</span>
        <span style={{ color: '#111' }}>{sub.form_id}</span>
        <span style={{ margin: '0 .5rem' }}>·</span>
        <span className={`badge badge-${sub.status}`}>{sub.status}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '.9rem', alignItems: 'start' }}>

        {/* Left: data preview */}
        <div>
          {/* Metadata card */}
          <div className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>
            <div style={{ background: '#111', color: '#fff', padding: '.55rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              Submission metadata
            </div>
            <table>
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
                  <tr key={String(k)}>
                    <td style={{ color: '#888', fontWeight: 700, fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.3px', width: '36%' }}>{k}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {k === 'Status'
                        ? <span className={`badge badge-${sub.status}`}>{sub.status}</span>
                        : <span style={{ fontSize: '.72rem' }}>{renderValue(v)}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Form data card */}
          <div className="cc" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#111', color: '#fff', padding: '.55rem .9rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              Form responses
            </div>
            <table>
              <tbody>
                {formKeys.map(k => (
                  <tr key={k}>
                    <td style={{ color: '#888', fontWeight: 700, fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.3px', width: '42%', verticalAlign: 'top' }}>
                      {label(k)}
                      <div style={{ fontSize: '.55rem', color: '#bbb', fontWeight: 400, fontFamily: 'monospace', marginTop: 1 }}>{k}</div>
                    </td>
                    <td style={{ verticalAlign: 'top', fontSize: '.72rem' }}>
                      {raw[k] === null || raw[k] === undefined
                        ? <span style={{ color: '#ccc' }}>—</span>
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
