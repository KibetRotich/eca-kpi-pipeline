/**
 * POST /api/import
 *
 * Accepts a multipart/form-data upload with:
 *   file        — ODK/Taro CSV export
 *   survey_year — e.g. "2025"
 *   form_id     — optional override if auto-detection fails
 *
 * For each row in the CSV, writes one record to odk_submissions (status=pending).
 * Returns { inserted: N, skipped: N, errors: [] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { supabaseAdmin } from '@/lib/supabase'
import { parseOdkRows, type FormId } from '@/lib/odk-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const surveyYearRaw = formData.get('survey_year') as string | null
    const formIdOverride = formData.get('form_id') as FormId | null

    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    if (!surveyYearRaw) return NextResponse.json({ error: 'survey_year is required.' }, { status: 400 })

    const surveyYear = parseInt(surveyYearRaw, 10)
    if (isNaN(surveyYear) || surveyYear < 2020 || surveyYear > 2035) {
      return NextResponse.json({ error: 'Invalid survey_year.' }, { status: 400 })
    }

    const text = await file.text()

    // Parse CSV → array of row objects
    const rows: Record<string, string>[] = parse(text, {
      columns: true,         // use first row as headers
      skip_empty_lines: true,
      trim: true,
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty.' }, { status: 400 })
    }

    // Detect form type and build ParsedSubmission objects
    const parsed = parseOdkRows(rows, formIdOverride ?? undefined)

    // Look up project UUIDs for all project_codes present
    const projectCodes = [...new Set(parsed.map(p => p.project_code).filter(Boolean))]
    const { data: projects, error: projError } = await supabaseAdmin
      .from('projects')
      .select('id, project_code')
      .in('project_code', projectCodes)

    if (projError) throw projError

    const codeToId = Object.fromEntries(projects?.map(p => [p.project_code, p.id]) ?? [])

    let inserted = 0
    let skipped  = 0
    const errors: string[] = []

    for (const sub of parsed) {
      const projectId = codeToId[sub.project_code]
      if (!projectId) {
        errors.push(`Row ${sub.submission_uuid}: unknown project_code "${sub.project_code}"`)
        skipped++
        continue
      }

      const { error: insError } = await supabaseAdmin
        .from('odk_submissions')
        .insert({
          submission_uuid: sub.submission_uuid,
          form_id:         sub.form_id,
          project_id:      projectId,
          country:         sub.country || null,
          submitted_at:    sub.submitted_at,
          raw_data:        { ...sub.raw_data, _survey_year: surveyYear },
          status:          'pending',
        })
        .select('id')
        .single()

      if (insError) {
        if (insError.code === '23505') {
          // duplicate submission_uuid — already imported
          skipped++
        } else {
          errors.push(`Row ${sub.submission_uuid}: ${insError.message}`)
          skipped++
        }
      } else {
        inserted++
      }
    }

    return NextResponse.json({ inserted, skipped, errors })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 })
  }
}
