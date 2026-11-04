/**
 * Annual report tracker — shared constants and helpers (Sprint 62).
 * Safe to import from client and server code (no secrets, no server-only imports).
 */
import { REPORT_COUNTRIES } from '@/lib/annual-reports'

export const TRACKER_STATUSES = ['not_started', 'drafting', 'with_cm', 'with_hop', 'submitted', 'final_filed'] as const
export type TrackerStatus = (typeof TRACKER_STATUSES)[number]

export const STATUS_LABEL: Record<TrackerStatus, string> = {
  not_started: 'Not started',
  drafting: 'Drafting',
  with_cm: 'With CM',
  with_hop: 'With HoP',
  submitted: 'Submitted to donor',
  final_filed: 'Final filed',
}

export interface ReportCycle { id: string; name: string; year: number }

export interface TrackerRow {
  id: string
  cycle_id: string
  project: string
  report_type: 'donor' | 'country'
  country: string | null
  responsible_names: string[]
  responsible_emails: string[]
  deadline_cm: string | null
  deadline_hop: string | null
  deadline_donor: string | null
  status: TrackerStatus
  annual_report_ids: string[]
  note: string | null
  sort_order: number
  updated_by: string | null
  updated_at: string
}

/** A final report linked to a tracker row (from annual_reports). */
export interface LinkedReport { id: string; title: string; source_url: string; file_type: 'pdf' | 'docx' | 'gdoc'; drive_file_id: string }

export type DeadlineKey = 'deadline_cm' | 'deadline_hop' | 'deadline_donor'

/**
 * The deadline the report is currently working towards, given its status:
 * before it reaches the CM → the CM deadline; with the CM → the HoP deadline; with the HoP → the donor deadline.
 * Falls back to the next deadline that is set. Submitted / final reports have none.
 */
export function nextDeadline(r: Pick<TrackerRow, 'status' | DeadlineKey>): DeadlineKey | null {
  const order: DeadlineKey[] =
    r.status === 'not_started' || r.status === 'drafting' ? ['deadline_cm', 'deadline_hop', 'deadline_donor']
    : r.status === 'with_cm' ? ['deadline_hop', 'deadline_donor']
    : r.status === 'with_hop' ? ['deadline_donor']
    : []
  return order.find(k => r[k]) ?? null
}

/** 'overdue' when the date has passed, 'soon' within 14 days, otherwise null. `today` is YYYY-MM-DD. */
export function deadlineState(date: string, today: string): 'overdue' | 'soon' | null {
  if (date < today) return 'overdue'
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000
  return days <= 14 ? 'soon' : null
}

export function canEditRow(row: Pick<TrackerRow, 'responsible_emails'>, email: string | null | undefined, isEditor: boolean) {
  return isEditor || (!!email && row.responsible_emails.includes(email.trim().toLowerCase()))
}

const EMAIL = /^[a-z0-9._%+-]+@solidaridadnetwork\.org$/

/** "Name <email>, Name2 <email2>" or one email per line → names + emails (staff domain only). */
export function parseResponsible(raw: string): { names: string[]; emails: string[]; error?: string } {
  const names: string[] = [], emails: string[] = []
  for (const part of raw.split(/[\n;,]+/).map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)\s*<\s*([^>]+)\s*>$/)
    const name = (m ? m[1] : '').trim()
    const email = (m ? m[2] : part.includes('@') ? part : '').trim().toLowerCase()
    if (email && !EMAIL.test(email)) return { names, emails, error: `${email} is not a @solidaridadnetwork.org address` }
    emails.push(email)          // '' when only a name is given, so names[i] and emails[i] stay paired
    names.push(name || (email ? email.split('@')[0].split('.').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ') : part))
  }
  return { names, emails }
}

export function formatResponsible(names: string[], emails: string[]) {
  return names.map((n, i) => (emails[i] ? `${n} <${emails[i]}>` : n)).join('\n')
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates the editable row fields shared by POST and PATCH. Returns the DB values or an error message. */
export function rowFields(b: Record<string, unknown>, partial: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {}
  if (!partial || 'project' in b) {
    const project = String(b.project ?? '').trim()
    if (project.length < 2 || project.length > 200) return 'Project & report must be 2–200 characters'
    out.project = project
  }
  if (!partial || 'report_type' in b) {
    const t = String(b.report_type ?? 'donor')
    if (t !== 'donor' && t !== 'country') return 'Unknown report type'
    out.report_type = t
  }
  if (!partial || 'country' in b) {
    const c = b.country ? String(b.country) : null
    if (c && !(REPORT_COUNTRIES as readonly string[]).includes(c)) return 'Unknown country'
    out.country = c
  }
  if (!partial || 'responsible' in b) {
    const r = parseResponsible(String(b.responsible ?? ''))
    if (r.error) return r.error
    if (!r.names.length) return 'Add at least one responsible person'
    out.responsible_names = r.names
    out.responsible_emails = r.emails
  }
  for (const k of ['deadline_cm', 'deadline_hop', 'deadline_donor'] as const) {
    if (!partial || k in b) {
      const v = b[k] ? String(b[k]) : null
      if (v && !DATE.test(v)) return 'Invalid deadline date'
      out[k] = v
    }
  }
  if (!partial || 'note' in b) {
    const n = String(b.note ?? '').trim()
    if (n.length > 1000) return 'Note is too long (1,000 characters max)'
    out.note = n || null
  }
  return out
}
