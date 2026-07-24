/**
 * Query layer for the ECA Trainings & Events dashboard.
 *
 * Reads ONLY the PII-free `v_eca_*_safe` / KPI views (granted to anon) via the
 * anon Supabase client — never the RLS-locked base tables. Global filters map to
 * PostgREST filters on the safe event view; because the dataset is small (~6.7k
 * events) we fetch the filtered rows (paged past PostgREST's 1000-row cap) and
 * aggregate in TS, which keeps every page correct under arbitrary filters. The
 * pre-aggregated KPI views remain available for unfiltered fast paths.
 */
import { supabase } from '@/lib/supabase'
import { type Filters, EQ_COLUMNS, parseFilters, filtersToQuery } from './filters'

export { parseFilters, filtersToQuery }
export type { Filters }

function applyEventFilters(q: any, f: Filters) {
  if (!f.includeTest) q = q.eq('is_real', true)
  for (const [key, col] of EQ_COLUMNS) if (f[key]) q = q.eq(col, f[key] as string)
  if (f.from) q = q.gte('training_date', f.from)
  if (f.to) q = q.lte('training_date', f.to)
  return q
}

// ── Paged fetch (past PostgREST's 1000-row cap) ───────────────────────────────

const PAGE = 1000

async function fetchAll(view: string, columns: string, f: Filters,
                        opts: { filtered?: boolean } = {}): Promise<any[]> {
  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(view).select(columns).range(from, from + PAGE - 1)
    if (opts.filtered !== false) q = applyEventFilters(q, f)
    const { data, error } = await q
    if (error) throw new Error(`${view}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// ── Filter options + admin cascade ────────────────────────────────────────────

export interface FilterOptions {
  countries: string[]
  projects: string[]
  commodities: string[]
  eventTypes: string[]
  trainingTypes: string[]
  admin1ByCountry: Record<string, string[]>
  admin2ByAdmin1: Record<string, string[]>
  dateMin: string | null
  dateMax: string | null
}

const uniqSort = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x && x.trim() !== ''))).sort()

export async function getFilterOptions(): Promise<FilterOptions> {
  // All real events' dimension columns (one paged pass), deduped in TS.
  const rows = await fetchAll(
    'v_eca_events_safe',
    'country_label,admin_level_1_label,admin_level_2,project_label,project_commodity_category_label,event_type_label,training_type_label,training_date',
    { includeTest: false },
  )
  const a1: Record<string, Set<string>> = {}
  const a2: Record<string, Set<string>> = {}
  let dmin: string | null = null, dmax: string | null = null
  for (const r of rows) {
    if (r.country_label && r.admin_level_1_label) {
      (a1[r.country_label] ??= new Set()).add(r.admin_level_1_label)
    }
    if (r.admin_level_1_label && r.admin_level_2) {
      (a2[r.admin_level_1_label] ??= new Set()).add(r.admin_level_2)
    }
    if (r.training_date) {
      if (!dmin || r.training_date < dmin) dmin = r.training_date
      if (!dmax || r.training_date > dmax) dmax = r.training_date
    }
  }
  const mapSets = (m: Record<string, Set<string>>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.from(v).sort()]))
  return {
    countries: uniqSort(rows.map(r => r.country_label)),
    projects: uniqSort(rows.map(r => r.project_label)),
    commodities: uniqSort(rows.map(r => r.project_commodity_category_label)),
    eventTypes: uniqSort(rows.map(r => r.event_type_label)),
    trainingTypes: uniqSort(rows.map(r => r.training_type_label)),
    admin1ByCountry: mapSets(a1),
    admin2ByAdmin1: mapSets(a2),
    dateMin: dmin, dateMax: dmax,
  }
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export interface Overview {
  totalEvents: number
  totalReach: number
  totalFemale: number
  totalYouth: number
  pctFemale: number | null
  pctYouth: number | null
  activeCountries: number
  activeProjects: number
  individualRecords: number
  byMonth: { month: string; events: number; reach: number }[]
  byEventType: { label: string; events: number }[]
  byCountry: { country: string; events: number; reach: number; pctFemale: number | null; pctYouth: number | null }[]
  sampleNote: { events: number }
}

export async function getOverview(f: Filters): Promise<Overview> {
  const rows = await fetchAll(
    'v_eca_events_safe',
    'total_participants,female_participants,youth_participants,n_individual_records,country_label,project_label,event_type_label,month',
    f,
  )
  const reach = rows.reduce((a, r) => a + num(r.total_participants), 0)
  const female = rows.reduce((a, r) => a + num(r.female_participants), 0)
  const youth = rows.reduce((a, r) => a + num(r.youth_participants), 0)

  const byMonthMap = new Map<string, { events: number; reach: number }>()
  const byCountryMap = new Map<string, { events: number; reach: number; female: number; youth: number }>()
  const byTypeMap = new Map<string, number>()
  for (const r of rows) {
    if (r.month) {
      const m = byMonthMap.get(r.month) ?? { events: 0, reach: 0 }
      m.events++; m.reach += num(r.total_participants); byMonthMap.set(r.month, m)
    }
    const c = r.country_label || 'Unknown'
    const cc = byCountryMap.get(c) ?? { events: 0, reach: 0, female: 0, youth: 0 }
    cc.events++; cc.reach += num(r.total_participants)
    cc.female += num(r.female_participants); cc.youth += num(r.youth_participants)
    byCountryMap.set(c, cc)
    const t = r.event_type_label || 'Unspecified'
    byTypeMap.set(t, (byTypeMap.get(t) ?? 0) + 1)
  }
  const pct = (x: number, d: number) => (d > 0 ? Math.round((x / d) * 1000) / 10 : null)

  return {
    totalEvents: rows.length,
    totalReach: reach,
    totalFemale: female,
    totalYouth: youth,
    pctFemale: pct(female, reach),
    pctYouth: pct(youth, reach),
    activeCountries: new Set(rows.map(r => r.country_label).filter(Boolean)).size,
    activeProjects: new Set(rows.map(r => r.project_label).filter(Boolean)).size,
    individualRecords: rows.reduce((a, r) => a + num(r.n_individual_records), 0),
    byMonth: Array.from(byMonthMap.entries()).sort().map(([month, v]) => ({ month, ...v })),
    byEventType: Array.from(byTypeMap.entries())
      .map(([label, events]) => ({ label, events })).sort((a, b) => b.events - a.events),
    byCountry: Array.from(byCountryMap.entries())
      .map(([country, v]) => ({ country, events: v.events, reach: v.reach, pctFemale: pct(v.female, v.reach), pctYouth: pct(v.youth, v.reach) }))
      .sort((a, b) => b.reach - a.reach),
    sampleNote: { events: rows.length },
  }
}

// ── Small aggregation utilities ───────────────────────────────────────────────

function tally<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>()
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  return m
}
const sortDesc = (m: Map<string, number>) =>
  Array.from(m.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
const pct = (x: number, d: number) => (d > 0 ? Math.round((x / d) * 1000) / 10 : null)

// ── b) Geography ──────────────────────────────────────────────────────────────

export async function getGeography(f: Filters) {
  const rows = await fetchAll('v_eca_events_safe',
    'country_label,admin_level_1_label,admin_level_2,lat,lon,training_location,total_participants', f)
  const a1 = new Map<string, { country: string; events: number; reach: number }>()
  const a2 = new Map<string, { country: string; admin1: string; admin2: string; events: number; reach: number }>()
  const gps: { lat: number; lon: number; reach: number; label: string }[] = []
  for (const r of rows) {
    const c = r.country_label || 'Unknown'
    if (r.admin_level_1_label) {
      const k = `${c}|${r.admin_level_1_label}`
      const e = a1.get(k) ?? { country: c, events: 0, reach: 0 }
      e.events++; e.reach += num(r.total_participants); a1.set(k, e)
    }
    if (r.admin_level_2) {
      const k = `${c}|${r.admin_level_1_label}|${r.admin_level_2}`
      const e = a2.get(k) ?? { country: c, admin1: r.admin_level_1_label || '', admin2: r.admin_level_2, events: 0, reach: 0 }
      e.events++; e.reach += num(r.total_participants); a2.set(k, e)
    }
    const lat = Number(r.lat), lon = Number(r.lon)
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) && gps.length < 3000)
      gps.push({ lat, lon, reach: num(r.total_participants), label: r.training_location || '' })
  }
  const byAdmin1 = Array.from(a1.entries()).map(([k, v]) => ({ admin1: k.split('|')[1], ...v })).sort((a, b) => b.reach - a.reach)
  const coverageGap = Array.from(a2.values()).sort((a, b) => a.reach - b.reach).slice(0, 25)
  return { byAdmin1, coverageGap, gps, totalEvents: rows.length }
}

// ── c) Gender & Youth ─────────────────────────────────────────────────────────

export async function getGenderYouth(f: Filters) {
  const rows = await fetchAll('v_eca_events_safe',
    'month,event_type_label,project_label,total_participants,female_participants,youth_participants', f)
  const mm = new Map<string, { t: number; f: number; y: number }>()
  const et = new Map<string, { female: number; total: number }>()
  const pj = new Map<string, { female: number; youth: number; total: number }>()
  for (const r of rows) {
    const t = num(r.total_participants), fe = num(r.female_participants), yo = num(r.youth_participants)
    if (r.month) { const e = mm.get(r.month) ?? { t: 0, f: 0, y: 0 }; e.t += t; e.f += fe; e.y += yo; mm.set(r.month, e) }
    const k = r.event_type_label || 'Unspecified'; const ee = et.get(k) ?? { female: 0, total: 0 }; ee.female += fe; ee.total += t; et.set(k, ee)
    const p = r.project_label || 'Unspecified'; const pp = pj.get(p) ?? { female: 0, youth: 0, total: 0 }; pp.female += fe; pp.youth += yo; pp.total += t; pj.set(p, pp)
  }
  return {
    byMonth: Array.from(mm.entries()).sort().map(([month, v]) => ({ month, pctFemale: pct(v.f, v.t), pctYouth: pct(v.y, v.t) })),
    byEventType: Array.from(et.entries()).map(([label, v]) => ({ label, female: v.female, male: Math.max(0, v.total - v.female) })).sort((a, b) => (b.female + b.male) - (a.female + a.male)),
    projectParity: Array.from(pj.entries()).map(([project, v]) => ({ project, pctFemale: pct(v.female, v.total), pctYouth: pct(v.youth, v.total), reach: v.total })).filter(p => p.reach > 0).sort((a, b) => (b.pctFemale ?? 0) - (a.pctFemale ?? 0)),
    totalEvents: rows.length,
  }
}

// ── d) Projects & Commodities ─────────────────────────────────────────────────

export async function getProjects(f: Filters) {
  const rows = await fetchAll('v_eca_events_safe',
    'project_label,project_commodity_category_label,country_label,total_participants,female_participants,youth_participants', f)
  const pj = new Map<string, { events: number; reach: number; female: number; youth: number; countries: Set<string> }>()
  const cm = new Map<string, { events: number; reach: number }>()
  for (const r of rows) {
    const t = num(r.total_participants)
    const p = r.project_label || 'Unspecified'
    const e = pj.get(p) ?? { events: 0, reach: 0, female: 0, youth: 0, countries: new Set() }
    e.events++; e.reach += t; e.female += num(r.female_participants); e.youth += num(r.youth_participants)
    if (r.country_label) e.countries.add(r.country_label); pj.set(p, e)
    const c = r.project_commodity_category_label || 'Unspecified'
    const cc = cm.get(c) ?? { events: 0, reach: 0 }; cc.events++; cc.reach += t; cm.set(c, cc)
  }
  return {
    league: Array.from(pj.entries()).map(([project, v]) => ({ project, events: v.events, reach: v.reach, countries: v.countries.size, pctFemale: pct(v.female, v.reach), pctYouth: pct(v.youth, v.reach) })).sort((a, b) => b.reach - a.reach),
    byCommodity: Array.from(cm.entries()).map(([commodity, v]) => ({ commodity, ...v })).sort((a, b) => b.reach - a.reach),
    totalEvents: rows.length,
  }
}

// ── e) Curriculum & Content ────────────────────────────────────────────────────

const STOP = new Set('the a an and or of to for in on at by with from is are training farmer farmers session sessions day event'.split(' '))

export async function getCurriculum(f: Filters) {
  const [topicRows, moduleRows, evRows] = await Promise.all([
    fetchAll('v_eca_topics_safe', 'label', f),
    fetchAll('v_eca_modules_safe', 'label', f),
    fetchAll('v_eca_events_safe', 'is_training_manual_used,manual_name,training_title', f),
  ])
  const topics = sortDesc(tally(topicRows, (r: any) => r.label))
  const modules = sortDesc(tally(moduleRows, (r: any) => r.label))
  let manualYes = 0, manualNo = 0
  const words = new Map<string, number>()
  for (const r of evRows) {
    const u = String(r.is_training_manual_used ?? '').toLowerCase()
    if (u === 'yes') manualYes++; else if (u === 'no') manualNo++
    for (const src of [r.manual_name, r.training_title]) {
      for (const w of String(src ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
        if (w.length > 2 && !STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1)
      }
    }
  }
  return {
    topTopics: topics.slice(0, 15),
    bottomTopics: topics.slice(-10).reverse(),
    modules,
    manualUsage: { yes: manualYes, no: manualNo, rate: pct(manualYes, manualYes + manualNo) },
    words: sortDesc(words).slice(0, 30),
    totalEvents: evRows.length,
  }
}

// ── f) Beneficiary Segments ────────────────────────────────────────────────────

export async function getBeneficiaries(f: Filters) {
  const [benRows, evRows] = await Promise.all([
    fetchAll('v_eca_beneficiaries_safe', 'submission_id,label', f),
    fetchAll('v_eca_events_safe', 'organization_name', f),
  ])
  const distribution = sortDesc(tally(benRows, (r: any) => r.label))
  // Co-occurrence across the top types.
  const bySub = new Map<number, Set<string>>()
  for (const r of benRows) { if (r.label) (bySub.get(r.submission_id) ?? bySub.set(r.submission_id, new Set()).get(r.submission_id)!).add(r.label) }
  const top = distribution.slice(0, 8).map(d => d.label)
  const idx = new Map(top.map((l, i) => [l, i]))
  const cells = top.map(() => top.map(() => 0))
  for (const set of bySub.values()) {
    const present = [...set].filter(l => idx.has(l))
    for (const a of present) for (const b of present) cells[idx.get(a)!][idx.get(b)!]++
  }
  const topOrgs = sortDesc(tally(evRows, (r: any) => (r.organization_name || '').trim() || null)).slice(0, 15)
  return { distribution, coMatrix: { labels: top, cells }, topOrgs, totalEvents: evRows.length }
}

// ── g) Facilitators ─────────────────────────────────────────────────────────────

export async function getFacilitators(f: Filters) {
  const [facRows, evRows] = await Promise.all([
    fetchAll('v_eca_facilitators_safe', 'facilitator_type_label,organization,month', f),
    fetchAll('v_eca_events_safe', 'total_participants', f),
  ])
  const typeMix = sortDesc(tally(facRows, (r: any) => r.facilitator_type_label || 'Unspecified'))
  const isToT = (l: string) => /tot|trainer of trainers/i.test(l)
  const isLead = (l: string) => /lead/i.test(l)
  const cm = new Map<string, { tot: number; lead: number }>()
  for (const r of facRows) {
    if (!r.month) continue
    const e = cm.get(r.month) ?? { tot: 0, lead: 0 }
    if (isToT(r.facilitator_type_label || '')) e.tot++
    if (isLead(r.facilitator_type_label || '')) e.lead++
    cm.set(r.month, e)
  }
  const reach = evRows.reduce((a, r) => a + num(r.total_participants), 0)
  return {
    typeMix,
    cascade: Array.from(cm.entries()).sort().map(([month, v]) => ({ month, tot: v.tot, lead: v.lead })),
    facilitatorCount: facRows.length,
    reach,
    ratio: facRows.length > 0 ? Math.round((reach / facRows.length) * 10) / 10 : null,
    orgDiversity: new Set(facRows.map((r: any) => (r.organization || '').trim()).filter(Boolean)).size,
    topOrgs: sortDesc(tally(facRows, (r: any) => (r.organization || '').trim() || null)).slice(0, 12),
  }
}

// ── h) Farmer-level Depth (server-side RPC) ─────────────────────────────────────

export async function getFarmerDepth(f: Filters) {
  const params = {
    p_country: f.country ?? null, p_admin1: f.admin1 ?? null, p_admin2: f.admin2 ?? null,
    p_project: f.project ?? null, p_commodity: f.commodity ?? null,
    p_event_type: f.eventType ?? null, p_training_type: f.trainingType ?? null,
    p_from: f.from ?? null, p_to: f.to ?? null, p_include_test: f.includeTest,
  }
  const [{ data, error }, evRows] = await Promise.all([
    supabase.rpc('eca_farmer_depth', params),
    fetchAll('v_eca_events_safe', 'total_participants,n_individual_records', f),
  ])
  if (error) throw new Error(`eca_farmer_depth: ${error.message}`)
  const d = (data ?? {}) as any
  return {
    reportedReach: evRows.reduce((a, r) => a + num(r.total_participants), 0),
    individualRecords: evRows.reduce((a, r) => a + num(r.n_individual_records), 0),
    rawRecords: num(d.raw_records),
    uniqueFarmers: num(d.unique_farmers),
    verified: num(d.verified),
    withPhone: num(d.with_phone),
    idCaptureRate: pct(num(d.verified), num(d.raw_records)),
    phoneCaptureRate: pct(num(d.with_phone), num(d.raw_records)),
    monthly: (d.monthly ?? []) as { month: string; new: number; returning: number }[],
    freq: (d.freq ?? []) as { bucket: string; farmers: number }[],
  }
}

// ── i) Data Quality & M&E ────────────────────────────────────────────────────────

export async function getDataQuality(f: Filters) {
  // Force include-test so the test/real ratio is meaningful; other filters apply.
  const rows = await fetchAll('v_eca_events_safe',
    'is_test,is_real,month,missing_gps,missing_photo,missing_sheet,missing_admin2,completeness_score,submission_lag_days,total_participants,n_individual_records',
    { ...f, includeTest: true })
  const mm = new Map<string, { real: number; test: number }>()
  let miss = { gps: 0, photo: 0, sheet: 0, admin2: 0 }, realN = 0
  let reach = 0, individual = 0, lagSum = 0, lagN = 0
  const lagBuckets = { '≤1d': 0, '2-7d': 0, '8-30d': 0, '>30d': 0, 'unknown': 0 }
  for (const r of rows) {
    if (r.month) { const e = mm.get(r.month) ?? { real: 0, test: 0 }; r.is_test ? e.test++ : e.real++; mm.set(r.month, e) }
    if (r.is_real) {
      realN++
      if (r.missing_gps) miss.gps++; if (r.missing_photo) miss.photo++
      if (r.missing_sheet) miss.sheet++; if (r.missing_admin2) miss.admin2++
      reach += num(r.total_participants); individual += num(r.n_individual_records)
      const lag = r.submission_lag_days
      if (lag == null || !Number.isFinite(Number(lag))) lagBuckets.unknown++
      else { const l = Number(lag); lagSum += l; lagN++
        if (l <= 1) lagBuckets['≤1d']++; else if (l <= 7) lagBuckets['2-7d']++
        else if (l <= 30) lagBuckets['8-30d']++; else lagBuckets['>30d']++ }
    }
  }
  const { data: enumerators } = await supabase.from('v_eca_enumerator_quality')
    .select('enumerator,submissions,avg_completeness,test_records').order('submissions', { ascending: false }).limit(20)
  return {
    testRealByMonth: Array.from(mm.entries()).sort().map(([month, v]) => ({ month, ...v })),
    missing: { realN, ...miss,
      pct: { gps: pct(miss.gps, realN), photo: pct(miss.photo, realN), sheet: pct(miss.sheet, realN), admin2: pct(miss.admin2, realN) } },
    reconciliation: { reportedReach: reach, individualRecords: individual, gap: reach - individual, capturePct: pct(individual, reach) },
    timeliness: { avgLagDays: lagN > 0 ? Math.round(lagSum / lagN) : null, buckets: lagBuckets },
    enumerators: enumerators ?? [],
    totalEvents: rows.length,
  }
}

// ── j) Time & Planning ────────────────────────────────────────────────────────

export async function getTimePlanning(f: Filters) {
  const rows = await fetchAll('v_eca_events_safe',
    'month,year,training_date,next_training_date,project_label,project_commodity_category_label', f)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const season = new Array(12).fill(0)
  const cadence = new Map<string, number>()
  const upcoming: { date: string; project: string; commodity: string }[] = []
  const today = new Date().toISOString().slice(0, 10)
  for (const r of rows) {
    if (r.training_date) { const mo = Number(r.training_date.slice(5, 7)) - 1; if (mo >= 0 && mo < 12) season[mo]++ }
    if (r.month) cadence.set(r.month, (cadence.get(r.month) ?? 0) + 1)
    if (r.next_training_date && r.next_training_date >= today)
      upcoming.push({ date: r.next_training_date, project: r.project_label || '—', commodity: r.project_commodity_category_label || '—' })
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  return {
    seasonality: MONTHS.map((m, i) => ({ month: m, events: season[i] })),
    cadence: Array.from(cadence.entries()).sort().map(([month, events]) => ({ month, events })),
    upcoming: upcoming.slice(0, 50),
    upcomingCount: upcoming.length,
    totalEvents: rows.length,
  }
}

/** Last data refresh (from eca_sync_meta). */
export async function getSyncMeta() {
  const { data } = await supabase
    .from('eca_sync_meta')
    .select('refreshed_at,source,event_count,real_count,test_count,choices_provisional')
    .eq('id', 1).maybeSingle()
  return data
}
