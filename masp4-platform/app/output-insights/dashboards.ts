/**
 * The Granular Data (Output Insights) dashboards — shared by the tile grid (./page.tsx) and the
 * in-platform viewer (./view/[slug]/page.tsx).
 *
 * `file` = a standalone dashboard in /public (rebuilt nightly by the Kobo pipelines). These open inside
 * the platform at /output-insights/view/<slug>, so the header and nav stay on screen and nothing opens
 * a new window. Entries without `file` are ordinary platform routes (`href`).
 *
 * To add a dashboard: append an entry below. The grid grows downward automatically.
 */
export type Dashboard = {
  slug: string
  /** Static file in /public, shown inside the platform viewer. */
  file?: string
  /** Platform route, for dashboards that are Next.js pages. */
  href?: string
  title: string
  blurb: string
  chips: string[]
}

export const DASHBOARDS: Dashboard[] = [
  {
    slug: 'eca-events',
    href: '/eca-events',
    title: 'ECA Trainings & Events Tracker',
    blurb: 'Training & event delivery analytics across Kenya, Uganda, Tanzania & Ethiopia — an overview of reach, events and commodities; where & who (geography, gender & youth, beneficiaries); what was delivered (curriculum, facilitators, timing); farmer-level depth; and data quality & notes. Global filters (date, country, project, event type) apply across every page.',
    chips: ['Overview', 'Where & Who', 'What Was Delivered', 'Farmer Depth', 'Data quality & notes'],
  },
  {
    slug: 'climate-heroes-reap',
    file: '/Seedlings_Dashboard.html',
    title: 'Climate Heroes / REAP Projects',
    blurb: 'Tree-seedlings request & distribution analytics for the Climate Heroes / REAP projects — seedlings requested and distributed by species and district, coverage maps, distribution progress and beneficiary reach. Refreshed nightly from KoboToolbox.',
    chips: ['Species', 'District coverage', 'Distribution', 'Beneficiaries', 'Trends'],
  },
  {
    slug: 'save-ke-seedlings',
    file: '/SAVE_KE_Seedlings_Dashboard.html',
    title: 'Seedlings Distribution — Kenya (SAVE KE)',
    blurb: 'Tree-seedling distribution analytics for SAVE KE (Nyandarua, Kenya) — unique farmers reached and seedlings handed out by sub-county, ward and village, automatically detected distribution rounds with new vs returning farmers, species mix (fodder, fruit, indigenous/timber), farmer groups, GPS map of distribution events, and data-quality checks including probable duplicate entries. Summary filters by sub-county, ward and round. Refreshed nightly from KoboToolbox.',
    chips: ['Summary', 'Reach & Geography', 'Distribution rounds', 'Species', 'Farmer groups', 'Operations', 'Data quality', 'Feedback'],
  },
  {
    slug: 'tree-survival-uganda',
    file: '/HC_Survival_UG_Dashboard.html',
    title: 'Tree Survival — Uganda (Harvesting Carbon)',
    blurb: 'Tree-survival monitoring for the Harvesting Carbon agroforestry programme (Uganda). Per-visit (batch) survival & establishment rates, loss reasons, growth-perception vs actual survival, and a coffee sub-section — with a regression Insights tab. Refreshed nightly from KoboToolbox.',
    chips: ['Survival by district', 'Species', 'Transport', 'Growth perception', 'Coffee', 'Insights'],
  },
  {
    slug: 'tree-survival-kenya',
    file: '/SAVE_KE_Survival_Dashboard.html',
    title: 'Tree Survival — Kenya (SAVE KE)',
    blurb: 'Tree-survival monitoring for SAVE KE (Kenya, Nyandarua). Per-species survival on monitored farms across four monitoring waves, crop & environmental/economic outcomes, loss reasons, and a regression/risk Insights tab. Refreshed nightly from KoboToolbox.',
    chips: ['Survival by species', 'Sub-county', 'Monitoring waves', 'Environment', 'Transport', 'Insights'],
  },
  {
    slug: 'climate-vulnerability',
    file: '/Climate_Vulnerability_Dashboard.html',
    title: 'Climate Vulnerability Assessment',
    blurb: 'Household climate-vulnerability analytics across Kenya & Uganda — exposure to 10 climate hazards (severity & frequency), impacts on production, harvest/storage, marketing & social wellbeing, sensitivity & adaptive-capacity indicators, and uptake of 10 adaptation-practice domains, with a vulnerability matrix flagging high-exposure / low-capacity households for targeting. Global filters apply across every tab. Refreshed nightly from KoboToolbox.',
    chips: ['Coverage', 'Hazard exposure', 'Impacts', 'Sensitivity & adaptive capacity',
      'Adaptation uptake', 'Vulnerability matrix'],
  },
  {
    slug: 'cool-farm',
    file: '/Cool_Farm_Dashboard.html',
    title: 'Cool Farm Crop Assessment',
    blurb: 'Cool Farm Tool–style carbon-assessment analytics for coffee & cocoa smallholdings (Uganda) — residue management and burning (81.8% of farms burn end-of-life residue), farmer & farm profile, production and yield intensity, fertiliser nitrogen parsed from product labels, crop protection, agroforestry & shade cover, land-use transition matrix, transport tonne-km, a grid-aggregated geography view, and an Advanced Analytics tier of normalised ratios (yield per plant, nitrogen-use efficiency, residue circularity, agroforestry integration). Reports practice adoption and derived input intensities — deliberately not CO2e, as the form carries no emission factors. Refreshed nightly from KoboToolbox.',
    chips: ['Residues & Burning', 'Farmer Profile', 'Crop & Farm', 'Production',
      'Fertiliser & Nutrients', 'Crop Protection', 'Agroforestry', 'Land Use & Forest',
      'Transport', 'Geography', 'Advanced Analytics', 'Data Quality'],
  },
  {
    slug: 'vsla-performance',
    file: '/VSLA_Performance_Dashboard.html',
    title: 'VSLA Performance',
    blurb: 'Village Savings & Loan Association performance analytics (Uganda) — membership growth, gender/youth/PWD inclusion, governance & leadership completeness, savings & loans with repayment/default benchmarking, social welfare fund adoption, institutional linkage, outcomes & sustainability, plus a theme-tagged qualitative insights panel (GBV/welfare handled aggregate-only). Global sub-county / parish / village / date filters apply across every tab. Refreshed nightly from KoboToolbox.',
    chips: ['Overview', 'Membership & Inclusion', 'Governance', 'Savings & Loans',
      'Social Welfare Fund', 'Institutional Linkage', 'Outcomes & Sustainability', 'Qualitative Insights', 'Geography'],
  },
]

/** Where a tile links to: the platform viewer for static dashboards, the route otherwise. */
export const dashboardLink = (d: Dashboard) => (d.file ? `/output-insights/view/${d.slug}` : d.href!)
