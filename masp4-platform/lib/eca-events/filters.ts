/**
 * Pure filter helpers (no Supabase import) — safe to unit-test in isolation.
 * The query layer (queries.ts) re-exports these and applies them to PostgREST.
 */
export interface Filters {
  from?: string
  to?: string
  country?: string
  admin1?: string
  admin2?: string
  project?: string
  commodity?: string
  eventType?: string
  trainingType?: string
  includeTest: boolean
}

type SP = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined

export function parseFilters(sp: SP): Filters {
  return {
    from: one(sp.from), to: one(sp.to),
    country: one(sp.country), admin1: one(sp.admin1), admin2: one(sp.admin2),
    project: one(sp.project), commodity: one(sp.commodity),
    eventType: one(sp.eventType), trainingType: one(sp.trainingType),
    includeTest: one(sp.includeTest) === '1',
  }
}

/** Serialise filters back to a query string (preserves state across nav). */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.country) p.set('country', f.country)
  if (f.admin1) p.set('admin1', f.admin1)
  if (f.admin2) p.set('admin2', f.admin2)
  if (f.project) p.set('project', f.project)
  if (f.commodity) p.set('commodity', f.commodity)
  if (f.eventType) p.set('eventType', f.eventType)
  if (f.trainingType) p.set('trainingType', f.trainingType)
  if (f.includeTest) p.set('includeTest', '1')
  return p.toString()
}

/** Filter key → safe-view column, for PostgREST equality filters. */
export const EQ_COLUMNS: Array<[keyof Filters, string]> = [
  ['country', 'country_label'], ['admin1', 'admin_level_1_label'],
  ['admin2', 'admin_level_2'], ['project', 'project_label'],
  ['commodity', 'project_commodity_category_label'],
  ['eventType', 'event_type_label'], ['trainingType', 'training_type_label'],
]
