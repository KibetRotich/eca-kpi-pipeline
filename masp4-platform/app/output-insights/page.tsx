/**
 * /output-insights — Output Insights hub.
 *
 * Compact tile grid of Kobo-form dashboards (5 columns on desktop, degrading to
 * 3 / 2 / 1 on narrower viewports). Each tile is a single link to a dashboard;
 * the full description and complete tag list are preserved in the markup
 * (visually condensed via line-clamp / a "+N more" chip, fully available to
 * screen readers). Styling lives in ./page.module.css and reuses the global
 * design tokens (app/globals.css) — no other page is affected.
 *
 * To add a dashboard: append an entry to DASHBOARDS below. The grid grows
 * downward automatically (5 per row).
 */
import styles from './page.module.css'

export const metadata = {
  title: 'Output Insights — MASP IV Data Platform',
}

type Dashboard = {
  href: string
  external?: boolean
  title: string
  blurb: string
  chips: string[]
}

const DASHBOARDS: Dashboard[] = [
  {
    href: '/Seedlings_Dashboard.html',
    external: true,
    title: 'Climate Heroes / REAP Projects',
    blurb: 'Tree-seedlings request & distribution analytics for the Climate Heroes / REAP projects — seedlings requested and distributed by species and district, coverage maps, distribution progress and beneficiary reach. Refreshed nightly from KoboToolbox.',
    chips: ['Species', 'District coverage', 'Distribution', 'Beneficiaries', 'Trends'],
  },
  {
    href: '/eca-events',
    title: 'ECA Trainings & Events Tracker',
    blurb: 'Training & event delivery analytics across Kenya, Uganda, Tanzania & Ethiopia — reach, gender & youth, geography, curriculum, beneficiaries, facilitators, farmer-level depth, data quality and planning. Global filters (date, country, project, event type) apply across every page.',
    chips: ['Executive Overview', 'Geography', 'Gender & Youth', 'Projects & Commodities',
      'Curriculum', 'Beneficiaries', 'Facilitators', 'Farmer Depth', 'Data Quality', 'Time & Planning'],
  },
  {
    href: '/HC_Survival_UG_Dashboard.html',
    external: true,
    title: 'Tree Survival — Uganda (Harvesting Carbon)',
    blurb: 'Tree-survival monitoring for the Harvesting Carbon agroforestry programme (Uganda). Per-visit (batch) survival & establishment rates, loss reasons, growth-perception vs actual survival, and a coffee sub-section — with a regression Insights tab. Refreshed nightly from KoboToolbox.',
    chips: ['Survival by district', 'Species', 'Transport', 'Growth perception', 'Coffee', 'Insights'],
  },
  {
    href: '/SAVE_KE_Survival_Dashboard.html',
    external: true,
    title: 'Tree Survival — Kenya (SAVE KE)',
    blurb: 'Tree-survival monitoring for SAVE KE (Kenya, Nyandarua). Per-species survival across 866 farmers and four monitoring waves, crop & environmental/economic outcomes, loss reasons, and a regression/risk Insights tab. Refreshed nightly from KoboToolbox.',
    chips: ['Survival by species', 'Sub-county', 'Monitoring waves', 'Environment', 'Transport', 'Insights'],
  },
  {
    href: '/Climate_Vulnerability_Dashboard.html',
    external: true,
    title: 'Climate Vulnerability Assessment',
    blurb: 'Household climate-vulnerability analytics across Kenya & Uganda — exposure to 10 climate hazards (severity & frequency), impacts on production, harvest/storage, marketing & social wellbeing, sensitivity & adaptive-capacity indicators, and uptake of 10 adaptation-practice domains, with a vulnerability matrix flagging high-exposure / low-capacity households for targeting. Global filters apply across every tab. Refreshed nightly from KoboToolbox.',
    chips: ['Coverage', 'Hazard exposure', 'Impacts', 'Sensitivity & adaptive capacity',
      'Adaptation uptake', 'Vulnerability matrix'],
  },
  {
    href: '/VSLA_Performance_Dashboard.html',
    external: true,
    title: 'VSLA Performance',
    blurb: 'Village Savings & Loan Association performance analytics (Uganda) — membership growth, gender/youth/PWD inclusion, governance & leadership completeness, savings & loans with repayment/default benchmarking, social welfare fund adoption, institutional linkage, outcomes & sustainability, plus a theme-tagged qualitative insights panel (GBV/welfare handled aggregate-only). Global sub-county / parish / village / date filters apply across every tab. Refreshed nightly from KoboToolbox.',
    chips: ['Overview', 'Membership & Inclusion', 'Governance', 'Savings & Loans',
      'Social Welfare Fund', 'Institutional Linkage', 'Outcomes & Sustainability', 'Qualitative Insights', 'Geography'],
  },
]

const MAX_VISIBLE_CHIPS = 3

function DashboardTile({ d }: { d: Dashboard }) {
  const visible = d.chips.slice(0, MAX_VISIBLE_CHIPS)
  const hidden = d.chips.slice(MAX_VISIBLE_CHIPS)
  return (
    <a
      href={d.href}
      className={styles.tile}
      {...(d.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {/* Heading level h2 matches the previous section headings. */}
      <h2 className={styles.title}>{d.title}</h2>
      {/* Full description kept in the DOM (line-clamped visually, tooltip + read in full by screen readers). */}
      <p className={styles.summary} title={d.blurb}>{d.blurb}</p>
      <div className={styles.tags}>
        {visible.map((c) => (
          <span key={c} className={styles.tag}>{c}</span>
        ))}
        {hidden.length > 0 && (
          <span className={styles.more} aria-hidden="true" title={hidden.join(', ')}>
            +{hidden.length} more
          </span>
        )}
      </div>
      {/* Complete tag list preserved for screen readers / future-proofing. */}
      <span className={styles.srOnly}>Topics: {d.chips.join(', ')}.</span>
      <span className={styles.cta}>
        Open dashboard <span aria-hidden="true">{d.external ? '↗' : '→'}</span>
      </span>
    </a>
  )
}

export default function OutputInsightsPage() {
  return (
    <div>
      <header style={{ marginBottom: '.9rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Output Insights</h1>
        <p style={{ margin: '.25rem 0 0', fontSize: '.78rem', color: '#555', maxWidth: 760 }}>
          Analytics built from Kobo data-collection forms. More form dashboards will be added here over time.
        </p>
      </header>

      <div className={styles.grid}>
        {DASHBOARDS.map((d) => (
          <DashboardTile key={d.href} d={d} />
        ))}
      </div>
    </div>
  )
}
