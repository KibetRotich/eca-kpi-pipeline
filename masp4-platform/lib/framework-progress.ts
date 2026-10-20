/**
 * Progress to date of one measurement-framework indicator — the rule the /targets scorecard
 * uses (app/targets/SheetFramework.tsx), shared so Network KPIs adds up the same figures:
 *   1. the sheet's end-of-project figure (eop_total) when it gives one;
 *   2. else the sheet's overall achievement so far (overall_total);
 *   3. else the sum of the periods when every period is per-period (cumulative = N);
 *   4. else the latest reported value (running totals).
 * `upTo` (YYYY-MM) cuts the history at a date; the sheet's EoP / overall figures are only used
 * when the cut covers the indicator's last period, since they describe the whole history.
 */
export interface FrameworkValueRow {
  period_end: string; cumulative: boolean | null
  total: number | null; male: number | null; female: number | null; youth: number | null
  eop_total?: number | null; eop_male?: number | null; eop_female?: number | null; eop_youth?: number | null
  overall_total?: number | null
  target_period?: number | null   // target planned in the period (Sprint 43)
}
export interface Progress { total: number; male: number | null; female: number | null; youth: number | null; basis: string }

const n = (v: unknown) => (v == null ? null : Number(v))
const add = (rows: FrameworkValueRow[], k: 'total' | 'male' | 'female' | 'youth') =>
  rows.some(r => r[k] != null) ? rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) : null

export function indicatorProgress(rowsIn: FrameworkValueRow[], upTo?: string): Progress | null {
  const all = [...rowsIn].sort((a, b) => a.period_end.localeCompare(b.period_end))
  if (!all.length) return null
  const whole = !upTo || upTo >= all[all.length - 1].period_end
  const rows = all.filter(r => !upTo || r.period_end <= upTo)
  const rep = rows.filter(r => r.total != null)
  const cum = all.map(r => r.cumulative).filter(c => c != null) as boolean[]
  const perPeriod = cum.length > 0 && !cum.some(Boolean)
  const latest = rep[rep.length - 1]

  const eop = whole ? all.find(r => r.eop_total != null) : undefined
  if (eop) return { total: Number(eop.eop_total), male: n(eop.eop_male), female: n(eop.eop_female), youth: n(eop.eop_youth), basis: 'end of project' }
  const overall = whole ? all.find(r => r.overall_total != null) : undefined
  if (overall) {
    const split = perPeriod ? { male: add(rep, 'male'), female: add(rep, 'female'), youth: add(rep, 'youth') }
                            : { male: n(latest?.male), female: n(latest?.female), youth: n(latest?.youth) }
    return { total: Number(overall.overall_total), ...split, basis: 'overall' }
  }
  if (!rep.length) return null
  if (perPeriod) return { total: add(rep, 'total') ?? 0, male: add(rep, 'male'), female: add(rep, 'female'), youth: add(rep, 'youth'), basis: 'sum of periods' }
  return { total: Number(latest.total), male: n(latest.male), female: n(latest.female), youth: n(latest.youth), basis: 'latest' }
}

/**
 * Yearly view for the Network KPIs farmers timeline: the cumulative achievement to `upTo` built from
 * the yearly values only (sum of per-period values, or the latest running total), never the sheet's
 * EoP / overall figure; and the cumulative target (sum of target_period to `upTo`), null when the
 * indicator has no yearly targets.
 */
export function cumulativeAchieved(rows: FrameworkValueRow[], upTo: string): number | null {
  return indicatorProgress(rows.map(r => ({ ...r, eop_total: null, overall_total: null })), upTo)?.total ?? null
}
export function cumulativeTarget(rows: FrameworkValueRow[], upTo: string): number | null {
  if (!rows.some(r => r.target_period != null)) return null
  return rows.filter(r => r.period_end <= upTo).reduce((a, r) => a + (Number(r.target_period) || 0), 0)
}
