/**
 * Thematic Insights — shared types (Sprint 49).
 * Safe to import from client and server code (no secrets, no server-only imports).
 *
 * A synthesis draws on the PUBLISHED studies of /evaluation-insights. Every point cites the studies it comes
 * from (`sources` = evaluation_reports ids), so readers can open the evidence behind it.
 */

export type EvidenceRating = 'strong' | 'moderate' | 'limited'

export const RATING_LABEL: Record<EvidenceRating, string> = {
  strong: 'Strong evidence', moderate: 'Moderate evidence', limited: 'Limited evidence',
}

/** Filled dots out of three, for the evidence meter. */
export const RATING_DOTS: Record<EvidenceRating, number> = { strong: 3, moderate: 2, limited: 1 }

/** One synthesised statement and the studies it is drawn from. */
export interface CitedPoint {
  text: string
  sources: string[]
}

/** A project followed across study stages (baseline → midline → endline). */
export interface ChangeOverTime {
  project: string
  country: string
  points: { stage: string; year: string; finding: string; source: string }[]
}

/**
 * A chart of figures quoted in the synthesis. Every chart has ONE unit, so only like-for-like figures share an axis
 * (figures in different units go in separate charts). Each row cites the study it comes from.
 *   dumbbell — before → after per item (e.g. baseline vs endline yield), optional target line
 *   bar      — one value per item, optional reference line (e.g. potential yield, living wage)
 *   stacked  — part-to-whole shares per item (values in the same order as `categories`)
 */
export type ThemeChart =
  | { type: 'dumbbell'; title: string; unit: string; note?: string
      rows: { label: string; before: number; after: number; beforeLabel: string; afterLabel: string; source: string }[]
      target?: { value: number; label: string } }
  | { type: 'bar'; title: string; unit: string; note?: string
      rows: { label: string; value: number; source: string }[]
      reference?: { value: number; label: string } }
  | { type: 'stacked'; title: string; unit: string; note?: string; categories: string[]
      rows: { label: string; values: number[]; source: string }[] }

/**
 * How a figure was measured. Board charts draw `self_reported` figures hollow, so they are never read as
 * equal to measured ones: `comparison` = participants vs a comparison group, `before_after` = measured at
 * two stages (e.g. monitoring data), `self_reported` = farmers' own estimates or recall.
 */
export type Basis = 'comparison' | 'before_after' | 'self_reported'

export const BASIS_LABEL: Record<Basis, string> = {
  comparison: 'vs comparison group', before_after: 'measured before → after', self_reported: 'self-reported',
}

/** A commodity's overall direction on one theme (the overview grid and the theme scorecard). */
export type CommodityStatus = 'improved' | 'mixed' | 'no_change' | 'worsened' | 'baseline_only'

export const STATUS_LABEL: Record<CommodityStatus, string> = {
  improved: 'Improved', mixed: 'Mixed', no_change: 'No clear change', worsened: 'Worsened',
  baseline_only: 'Baseline only',
}

/** Commodity names used by theme scorecards and study filters. F&V = fruits & vegetables (was 'Horticulture', Sprint 53). */
export const COMMODITIES = [
  'Coffee', 'Maize', 'Food crops', 'F&V', 'Dairy', 'Livestock & beef', 'Tea', 'Oil palm',
  'Beans & barley', 'Cotton & textiles', 'Leather', 'Gold',
] as const

/**
 * The board-level view of a theme (Sprint 51): a few headline figures and charts instead of prose.
 * Every number cites the study it comes from (`source`), although the board view does not show citations.
 */
export interface BoardView {
  /** 3–4 headline tiles, e.g. value "+2.1 bags/acre", label "Maize yield", context "CSV-Maize, Kenya".
   *  `explain` (Sprint 57) is one plain-language sentence saying what the number counts, for whom and when. */
  figures: { value: string; label: string; context: string; basis: Basis; source: string; explain?: string }[]
  /** % change by commodity; `from`/`to` keep the underlying values (e.g. "1.73 kg/tree") visible. */
  change: { commodity: string; indicator: string; pct: number; from: string; to: string; basis: Basis; source: string }[]
  /** One row per commodity with evidence in this theme; names come from COMMODITIES. */
  scorecard: { commodity: string; status: CommodityStatus }[]
  /** One indicator, one unit, two or more points per project. */
  series: { project: string; indicator: string; unit: string; points: { label: string; value: number; source: string }[] }[]
  /** Three short lines each. */
  takeaways: { works: string[]; barriers: string[]; actions: string[] }
  /** One sentence on how far the evidence can be trusted. */
  confidence: string
}

/** What the synthesis step stores in theme_insights.synthesis. */
export interface ThemeSynthesis {
  board?: BoardView
  headline: string
  key_evidence: CitedPoint[]
  charts?: ThemeChart[]
  change_over_time: ChangeOverTime[]
  what_works: CitedPoint[]
  barriers: CitedPoint[]
  recommendations: CitedPoint[]
  evidence_gaps: string[]
  rating_reason: string
}

export interface Theme {
  key: string
  title: string
  description: string
  sort_order: number
}

export interface ThemeInsight {
  id: string
  theme_key: string
  status: 'draft' | 'published' | 'superseded' | 'rejected'
  synthesis: ThemeSynthesis
  evidence_rating: EvidenceRating
  source_report_ids: string[]
  review_note: string | null
  generated_at: string
  published_at: string | null
}

/** The study fields shown next to a citation. */
export interface SourceStudy {
  id: string
  title: string
  programme: string
  country: string
  tags: string[]
  period_start: string | null
  period_end: string | null
}

export const STAGES = ['Baseline', 'Midline', 'Endline', 'Impact evaluation', 'Thematic study'] as const

/** The study stage, taken from its tags ("Study" when none is tagged). */
export function studyStage(tags: string[]): string {
  return STAGES.find(s => tags.includes(s)) ?? 'Study'
}
