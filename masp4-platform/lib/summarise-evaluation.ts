/**
 * Evaluation Insights summarisation pipeline (Sprint 47). SERVER ONLY — never import from a client component.
 *
 * summariseEvaluation(id):
 *   1. downloads the report from the private `reports` bucket,
 *   2. sends it to the Claude API (PDF as a document block; DOCX converted to plain text with mammoth),
 *   3. stores the structured summary on evaluation_reports as a DRAFT (status 'draft'),
 *      or the reason it failed (status 'failed').
 * A draft only becomes public when an admin / M&E officer publishes it (/api/evaluations/[id]/review).
 *
 * Needs ANTHROPIC_API_KEY in the environment (Vercel project settings). Without it — and for studies linked
 * from Google Drive rather than uploaded — reports wait as 'queued' and their summaries are written from a
 * Claude Code session instead (Option C, 2026-10-21); see canAutoSummarise().
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import mammoth from 'mammoth'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { formatPeriod, type EvaluationSummary } from '@/lib/evaluations'

const MODEL = 'claude-opus-5-5'

const SummarySchema = z.object({
  headline: z.string().describe('The single most important insight from the report, in one or two sentences.'),
  overview: z.string().describe('One paragraph (at most 120 words): what was studied, where, when, with whom, and why.'),
  key_findings: z.array(z.string()).describe('3 to 7 key findings, one sentence each, with the reported figures where the report gives them.'),
  recommendations: z.array(z.string()).describe('Up to 7 recommendations made in the report. Empty if the report makes none.'),
  lessons_learned: z.array(z.string()).describe('Up to 5 lessons learned stated or clearly drawn in the report. Empty if none.'),
  methodology: z.string().describe('One or two sentences on design, sample and data collection, or "Not stated in the report."'),
  limitations: z.array(z.string()).describe('Up to 5 limitations stated in the report. Empty if none are stated.'),
})

const SYSTEM = `You summarise evaluation and study reports for the monitoring, evaluation and learning team of Solidaridad East & Central Africa, an international development organisation working with smallholder farmers, businesses and governments.

An M&E officer reviews every summary before it is published on the organisation's Evaluation Insights page, where programme staff use it to find key insights quickly.

Rules:
- Use only what the report says. Do not invent or estimate figures, results or conclusions. Where the report does not cover something, leave that list empty, or write "Not stated in the report." for the methodology.
- Keep numbers exactly as reported, with their units and the group or year they refer to.
- Do not include names, phone numbers or any other details that identify individual farmers, beneficiaries, respondents or staff. Refer to groups instead (for example "women coffee farmers in Masaka").
- Keep the report's own distinctions: say when a finding applies only to a sub-group, region or year.
- Write in plain, concise English for programme staff. No marketing language.`

/** True when uploads can be summarised automatically on this deployment. */
export function canAutoSummarise() {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Thrown for problems the uploader or reviewer should see verbatim. */
class SummaryError extends Error {}

async function markFailed(id: string, message: string) {
  await supabaseAdmin.from('evaluation_reports')
    .update({ status: 'failed', error: message.slice(0, 1000), processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function summariseEvaluation(id: string): Promise<void> {
  try {
    if (!canAutoSummarise()) {
      await supabaseAdmin.from('evaluation_reports')
        .update({ status: 'queued', error: null, updated_at: new Date().toISOString() }).eq('id', id)
      return
    }

    const { data: row, error } = await supabaseAdmin.from('evaluation_reports')
      .select('id, title, programme, country, period_start, period_end, tags, file_path, file_type')
      .eq('id', id).single()
    if (error || !row) throw new SummaryError('Report record not found.')
    if (!row.file_path) throw new SummaryError('This study is linked from Google Drive; its summary is written from Claude Code.')

    const file = await supabaseAdmin.storage.from('reports').download(row.file_path)
    if (file.error || !file.data) throw new SummaryError('The uploaded file could not be read from storage.')
    const buffer = Buffer.from(await file.data.arrayBuffer())

    let document: Anthropic.Beta.BetaRequestDocumentBlock
    if (row.file_type === 'pdf') {
      document = { type: 'document', title: row.title, source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    } else {
      const { value } = await mammoth.extractRawText({ buffer })
      const text = value.trim()
      if (text.length < 200) throw new SummaryError('The Word document has too little readable text to summarise.')
      document = { type: 'document', title: row.title, source: { type: 'text', media_type: 'text/plain', data: text } }
    }

    const context = [
      `Title: ${row.title}`,
      `Programme: ${row.programme}`,
      `Country: ${row.country}`,
      row.period_start || row.period_end ? `Evaluation period: ${formatPeriod(row.period_start, row.period_end)}` : null,
      row.tags?.length ? `Tags: ${row.tags.join(', ')}` : null,
    ].filter(Boolean).join('\n')

    const client = new Anthropic({ timeout: 240_000, maxRetries: 1 })
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(SummarySchema) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          document,
          { type: 'text', text: `Details given by the person who uploaded the report:\n${context}\n\nSummarise this report.` },
        ],
      }],
    })

    if (response.stop_reason === 'refusal') {
      throw new SummaryError('The AI service declined to summarise this report. Please review it manually.')
    }
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
      throw new SummaryError('The AI summary was incomplete. Use Retry to process the report again.')
    }

    const summary: EvaluationSummary = response.parsed_output
    const { error: saveErr } = await supabaseAdmin.from('evaluation_reports')
      .update({ status: 'draft', summary, model: response.model, error: null,
                processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
    if (saveErr) throw new SummaryError('The summary could not be saved.')
  } catch (e) {
    let message = 'Summarisation failed unexpectedly. Use Retry to try again.'
    if (e instanceof SummaryError) message = e.message
    else if (e instanceof Anthropic.BadRequestError) message = `The AI service could not read this file: ${e.message}`
    else if (e instanceof Anthropic.AuthenticationError) message = 'The AI service rejected the platform API key.'
    else if (e instanceof Anthropic.RateLimitError) message = 'The AI service is busy. Use Retry in a few minutes.'
    else if (e instanceof Anthropic.APIError) message = `The AI service returned an error (${e.status}). Use Retry to try again.`
    console.error(`[evaluations] summarise ${id} failed:`, e)
    await markFailed(id, message)
  }
}
