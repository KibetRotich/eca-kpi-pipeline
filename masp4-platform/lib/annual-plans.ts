/**
 * Annual Plans & Budgets — shared constants, types and helpers (Sprint 69).
 * Safe to import from client and server code (no secrets, no server-only imports).
 * No imports, so it can be unit-tested directly. The country list, staff check and the programme "other" value are
 * shared with Annual Reports: import REPORT_COUNTRIES, PROGRAMME_OTHER and isStaffEmail from '@/lib/annual-reports'.
 */

export const MIN_PLAN_YEAR = 2015

export type PlanScope = 'project' | 'regional'
export type PlanDocKind = 'plan' | 'budget' | 'plan_budget' | 'supporting'
export type PlanStatus = 'final' | 'draft'
export type PlanFileType = 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'xlsm' | 'pptx' | 'gdoc' | 'gsheet' | 'gslides'

export const SCOPE_LABEL: Record<PlanScope, string> = { project: 'Project', regional: 'Regional (REC ECA)' }

export const DOC_KIND_LABEL: Record<PlanDocKind, string> = {
  plan: 'Workplan',
  budget: 'Budget',
  plan_budget: 'Workplan + budget',
  supporting: 'Supporting document',
}

export const FILE_TYPE_LABEL: Record<PlanFileType, string> = {
  pdf: 'PDF', docx: 'Word', doc: 'Word (.doc)', xlsx: 'Excel', xls: 'Excel (.xls)', xlsm: 'Excel (macro)',
  pptx: 'PowerPoint', gdoc: 'Google Doc', gsheet: 'Google Sheet', gslides: 'Google Slides',
}

/** File types staff choose from when a plain Drive file link does not reveal its type. */
export const UPLOAD_FILE_TYPES: PlanFileType[] = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'xlsm', 'pptx']

/** The two sub-tabs. A combined workplan + budget file appears in both. */
export type PlanSubTab = 'plans' | 'budgets'
export const SUBTAB_KINDS: Record<PlanSubTab, PlanDocKind[]> = {
  plans: ['plan', 'plan_budget', 'supporting'],
  budgets: ['budget', 'plan_budget'],
}

export interface AnnualPlan {
  id: string
  title: string
  scope: PlanScope
  doc_kind: PlanDocKind
  status: PlanStatus
  programme: string
  country: string
  plan_year: number
  period_label: string | null
  drive_file_id: string
  source_url: string
  file_type: PlanFileType
}

const ID = /^[A-Za-z0-9_-]{20,}$/

/**
 * Reads a Google Drive / Docs / Sheets / Slides share link and returns the file id, the canonical link stored as
 * source_url, and the file type when the link itself reveals it (Google Docs, Sheets, Slides). Null for anything
 * that is not a link to a single file (folders, other sites).
 */
export function parsePlanLink(raw: string): { id: string; url: string; type: 'gdoc' | 'gsheet' | 'gslides' | null } | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null

  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/)
    if (!m || !ID.test(m[2])) return null
    const kind = m[1] === 'document' ? 'gdoc' : m[1] === 'spreadsheets' ? 'gsheet' : 'gslides'
    return { id: m[2], url: `https://docs.google.com/${m[1]}/d/${m[2]}/edit`, type: kind }
  }
  if (u.hostname === 'drive.google.com') {
    const m = u.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/)
    const id = m?.[1] ?? ((u.pathname === '/open' || u.pathname === '/uc') ? u.searchParams.get('id') : null)
    return id && ID.test(id) ? { id, url: `https://drive.google.com/file/d/${id}/view`, type: null } : null
  }
  return null
}

/**
 * The link a plan opens with. Drive's file preview often shows a blank page for Office files, so Word, Excel and
 * PowerPoint files open in the matching Google editor's Office viewer (rtpof=true keeps the file in its format).
 */
export function planOpenUrl(p: Pick<AnnualPlan, 'drive_file_id' | 'source_url' | 'file_type'>): string {
  const id = p.drive_file_id
  switch (p.file_type) {
    case 'docx': case 'doc': return `https://docs.google.com/document/d/${id}/edit?rtpof=true&sd=true`
    case 'xlsx': case 'xls': case 'xlsm': return `https://docs.google.com/spreadsheets/d/${id}/edit?rtpof=true&sd=true`
    case 'pptx': return `https://docs.google.com/presentation/d/${id}/edit?rtpof=true&sd=true`
    default: return p.source_url
  }
}

/** Coverage cell for one programme in one year. 'missing' only between a programme's first and last year. */
export type CoverageCell = 'final' | 'draft' | 'missing' | null

export interface CoverageRow { scope: PlanScope; programme: string; cells: Record<number, CoverageCell> }

/**
 * Builds the coverage grid for a sub-tab from the registered files: a programme-year is "final" when any final file of
 * the sub-tab's kinds exists, "draft" when only drafts exist, and "missing" when the year lies inside the programme's
 * active span (first to last year with any file) but has none. Supporting documents never count.
 */
export function buildCoverage(plans: AnnualPlan[], tab: PlanSubTab): { years: number[]; rows: CoverageRow[] } {
  const kinds: PlanDocKind[] = SUBTAB_KINDS[tab].filter(k => k !== 'supporting')
  const relevant = plans.filter(p => kinds.includes(p.doc_kind))
  const byProg = new Map<string, { scope: PlanScope; programme: string; years: Map<number, CoverageCell> }>()
  for (const p of relevant) {
    const key = `${p.scope}|${p.programme}`
    const entry = byProg.get(key) ?? { scope: p.scope, programme: p.programme, years: new Map() }
    const prev = entry.years.get(p.plan_year)
    entry.years.set(p.plan_year, prev === 'final' || p.status === 'final' ? 'final' : 'draft')
    byProg.set(key, entry)
  }
  const all = relevant.map(p => p.plan_year)
  if (!all.length) return { years: [], rows: [] }
  const years: number[] = []
  for (let y = Math.max(...all); y >= Math.min(...all); y--) years.push(y)

  const rows: CoverageRow[] = [...byProg.values()].map(e => {
    const ys = [...e.years.keys()]
    const lo = Math.min(...ys), hi = Math.max(...ys)
    const cells: Record<number, CoverageCell> = {}
    for (const y of years) cells[y] = e.years.get(y) ?? (y >= lo && y <= hi ? 'missing' : null)
    return { scope: e.scope, programme: e.programme, cells }
  })
  rows.sort((a, b) => a.scope.localeCompare(b.scope) || a.programme.localeCompare(b.programme))
  return { years, rows }
}
