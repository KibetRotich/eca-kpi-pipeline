/**
 * /instructions — Data Collection, Methodology & Platform Guide
 */

export const metadata = {
  title: 'Instructions — MASP IV Data Platform',
}

const YELLOW = '#FFC800'
const NAVY   = '#1a3557'
const ORANGE = '#e65100'
const GREEN  = '#2e7d32'
const BLACK  = '#111'

function Section({ title, color = BLACK, children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.7rem' }}>
        <div style={{ width: 4, height: 20, background: color, flexShrink: 0 }} />
        <h2 style={{ fontSize: '0.85rem', fontWeight: 800, color: BLACK, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="cc" style={{ padding: '1rem 1.1rem', marginBottom: '.7rem', ...style }}>
      {children}
    </div>
  )
}

function KpiRow({ code, label, pathway, color, method, description }: {
  code: string; label: string; pathway: string; color: string;
  method: 'sample' | 'count'; description: string
}) {
  const textColor = color === YELLOW ? '#000' : '#fff'
  return (
    <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
      <td style={{ padding: '.5rem .7rem', width: 64 }}>
        <span style={{ background: color, color: textColor, fontSize: '0.54rem', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '.6px', padding: '.12rem .4rem', display: 'inline-block' }}>
          {code}
        </span>
      </td>
      <td style={{ padding: '.5rem .7rem', fontSize: '0.72rem', fontWeight: 700, color: '#222' }}>{label}</td>
      <td style={{ padding: '.5rem .7rem', fontSize: '0.65rem', color: '#666' }}>{pathway}</td>
      <td style={{ padding: '.5rem .7rem', textAlign: 'center' }}>
        {method === 'sample' ? (
          <span style={{ background: YELLOW, color: '#000', fontSize: '0.5rem', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.5px', padding: '.1rem .35rem' }}>
            Sample + Extrapolation
          </span>
        ) : (
          <span style={{ background: '#e8e8e8', color: '#444', fontSize: '0.5rem', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.5px', padding: '.1rem .35rem' }}>
            Direct Count
          </span>
        )}
      </td>
      <td style={{ padding: '.5rem .7rem', fontSize: '0.65rem', color: '#555', lineHeight: 1.5 }}>{description}</td>
    </tr>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, background: BLACK, color: YELLOW,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.7rem', fontWeight: 800 }}>
        {n}
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: BLACK, marginBottom: '.25rem' }}>{title}</div>
        <div style={{ fontSize: '0.68rem', color: '#555', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

export default function InstructionsPage() {
  return (
    <div style={{ fontSize: '0.72rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '1.4rem' }}>
        <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: BLACK, lineHeight: 1.2 }}>
              MASP IV Data Platform — Instructions &amp; Methodology
            </div>
            <div style={{ fontSize: '0.62rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 4 }}>
              Solidaridad East &amp; Central Africa · 2026–2030
            </div>
        </div>
        <div style={{ height: 3, background: YELLOW, marginTop: '.7rem', maxWidth: 400 }} />
      </div>

      {/* Overview */}
      <Section title="Overview" color={YELLOW}>
        <Card>
          <p style={{ lineHeight: 1.8, color: '#333' }}>
            This platform collects, processes, and visualises results for the <strong>seven MASP IV KPIs</strong> across
            Solidaridad's East &amp; Central Africa programme (Kenya, Uganda, Tanzania, Ethiopia) from 2026 to 2030.
            Data enters through <strong>KoboToolbox surveys</strong> completed by project teams in the field.
            The system distinguishes between two measurement approaches — <em>sample-based extrapolation</em> for
            farmer-level production KPIs, and <em>direct counting</em> for institutional and company KPIs.
            <strong> 2026 is the Baseline Year</strong> — survey data collected this year establishes reference values;
            achievement comparisons begin from 2027.
          </p>
        </Card>
      </Section>

      {/* KPI Framework */}
      <Section title="KPI Framework" color={NAVY}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
            <thead>
              <tr style={{ background: BLACK, color: '#fff' }}>
                <th style={{ padding: '.5rem .7rem', textAlign: 'left', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.58rem' }}>Code</th>
                <th style={{ padding: '.5rem .7rem', textAlign: 'left', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.58rem' }}>Indicator</th>
                <th style={{ padding: '.5rem .7rem', textAlign: 'left', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.58rem' }}>Pathway</th>
                <th style={{ padding: '.5rem .7rem', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.58rem' }}>Measurement</th>
                <th style={{ padding: '.5rem .7rem', textAlign: 'left', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: '0.58rem' }}>What is counted</th>
              </tr>
            </thead>
            <tbody>
              <KpiRow code="S6.1" label="Farmers with enhanced resilience"        pathway="Production"  color={YELLOW} method="sample"
                description="Farmers whose Resilience Index (0–35) improved from baseline. Index sums 7 sub-scores: soil health (C:N ratio), collective membership, local decision-making, income stability, shock recovery, savings buffer, income diversification." />
              <KpiRow code="S6.2" label="Farmers with improved farm viability"    pathway="Production"  color={YELLOW} method="sample"
                description="Farmers whose Farm Viability Index (0–30) exceeds 33% threshold (score > 10). Index sums 6 sub-scores: yield growth, income diversification, income perception, service quality, market access, GAP adoption (of 9 practices)." />
              <KpiRow code="S2.1" label="Farmers accessing new/improved services" pathway="Services"   color={NAVY}   method="sample"
                description="Farmers who received at least one new or quality-improved service from a Solidaridad-supported service provider. Confirmed by farmer survey + SP triangulation." />
              <KpiRow code="S2.5" label="Individuals co-owning businesses"        pathway="Services"   color={NAVY}   method="count"
                description="Direct count of farmers and service providers holding recognised co-ownership stakes in value-addition or service businesses. No extrapolation — reported headcount only." />
              <KpiRow code="S6.3" label="Regulations / frameworks improved"       pathway="Governance" color={ORANGE} method="count"
                description="Direct count of mandatory regulations or voluntary frameworks improved, established, or implemented. Reported by CSOs using a Tier 1/2/3 progress scale. No sampling involved." />
              <KpiRow code="S6.4" label="Companies rewarding farmers directly"    pathway="Market"     color={GREEN}  method="count"
                description="Direct count of partner companies that have adopted and implemented direct farmer reward mechanisms (e.g. premium payments, bonus schemes). Reported by company respondents." />
              <KpiRow code="S6.5" label="Companies with responsible procurement"  pathway="Market"     color={GREEN}  method="count"
                description="Direct count of partner companies with responsible procurement policies in place. Scored on 5 criteria: policy document, SMART commitments, action plan, country coverage, third-party verification." />
            </tbody>
          </table>
        </Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem', marginTop: '.7rem' }}>
          <Card style={{ borderTop: `3px solid ${YELLOW}` }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888', marginBottom: '.4rem' }}>Sample-based KPIs</div>
            <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.7 }}>
              <strong>S6.1, S6.2, S2.1</strong> use household survey samples.
              Achievement is <em>extrapolated</em> from the sample to the full target population using a
              post-stratification estimator. Cards in the dashboard show an <span style={{ background: YELLOW, color: '#000',
              fontSize: '0.5rem', fontWeight: 800, textTransform: 'uppercase', padding: '0 .25rem' }}>est.</span> badge.
              During 2026 (Baseline), raw sample counts are shown — no extrapolation is applied.
            </div>
          </Card>
          <Card style={{ borderTop: `3px solid ${BLACK}` }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888', marginBottom: '.4rem' }}>Count-based KPIs</div>
            <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.7 }}>
              <strong>S2.5, S6.3, S6.4, S6.5</strong> are direct counts — every qualifying individual,
              regulation, or company is reported by the responsible respondent (farmer/SP for S2.5,
              CSO for S6.3, company for S6.4/S6.5). Cards show a
              <span style={{ background: '#e8e8e8', color: '#444', fontSize: '0.5rem', fontWeight: 800,
              textTransform: 'uppercase', padding: '0 .25rem', marginLeft: '.25rem' }}>count</span> badge.
              No sampling or extrapolation is involved.
            </div>
          </Card>
        </div>
      </Section>

      {/* Data Collection Process */}
      <Section title="Data Collection Process" color={ORANGE}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
          <div>
            <Card>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.6rem' }}>Farmer surveys (S6.1, S6.2, S2.1, S2.5)</div>
              <Step n={1} title="Sampling frame">
                Project teams define the target population for each project (e.g. all registered farmers in the programme area). Targets are entered in the <em>Targets &amp; Achievements</em> tab, disaggregated by KPI and gender where available.
              </Step>
              <Step n={2} title="Sample design">
                A random or systematic sample of farmers is drawn from the target population. Gender-stratified sampling is recommended so that female and male farmers are sampled in proportion to their share of the target.
              </Step>
              <Step n={3} title="Survey administration">
                Enumerators use the KoboToolbox form (download above) on mobile devices. Each response is submitted to the Solidaridad KoboToolbox server in real time. The form covers S6.1, S6.2, S2.1, and S2.5 in a single interview per farmer.
              </Step>
              <Step n={4} title="Export &amp; upload">
                Project officers export the completed survey as a CSV from KoboToolbox and upload it via the <em>Import CSV</em> tab on this platform. Submissions enter a review queue before being approved and counted.
              </Step>
            </Card>
          </div>
          <div>
            <Card>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.6rem' }}>Institutional surveys (S6.3, S6.4, S6.5)</div>
              <Step n={1} title="Respondent identification">
                Country managers identify the CSOs (for S6.3) and companies (for S6.4/S6.5) engaged in each project during the survey year.
              </Step>
              <Step n={2} title="Form completion">
                Respondents complete the dedicated CSO or Company KoboToolbox form. These are separate forms from the farmer survey. (S6.3, S6.4, S6.5 company forms are under development.)
              </Step>
              <Step n={3} title="Upload &amp; review">
                Completed CSVs are uploaded via Import CSV. Each submission is reviewed before approval.
              </Step>
              <Step n={4} title="No extrapolation">
                All S6.3–S6.5 counts are reported directly. Every regulation improved, and every qualifying company, is counted as one unit. No sampling or estimation is applied.
              </Step>
            </Card>
          </div>
        </div>
      </Section>

      {/* Extrapolation Methodology */}
      <Section title="Extrapolation Methodology (S6.1 · S6.2 · S2.1)" color={GREEN}>
        <Card>
          <div style={{ fontSize: '0.68rem', lineHeight: 1.8, color: '#333', marginBottom: '.8rem' }}>
            For sample-based KPIs, the number of farmers meeting the threshold in the full target population is
            estimated using a <strong>post-stratification estimator</strong>. This corrects for unequal sampling
            rates between female and male strata.
          </div>

          <div style={{ background: '#f8f8f8', border: '1px solid #e8e8e8', padding: '.8rem 1rem', marginBottom: '.8rem', fontFamily: 'monospace' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '.4rem' }}>Formula (with gender stratification)</div>
            <div style={{ fontSize: '0.75rem', color: BLACK, lineHeight: 2 }}>
              Achievement = <strong>(f_threshold / f_surveyed) × Target_Female</strong><br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ <strong>(m_threshold / m_surveyed) × Target_Male</strong>
            </div>
            <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '.6rem', paddingTop: '.6rem', fontSize: '0.65rem', color: '#777' }}>
              <strong>f_threshold</strong> = female farmers in sample who meet the threshold<br />
              <strong>f_surveyed</strong> = total female farmers surveyed<br />
              <strong>m_threshold / m_surveyed</strong> = same for male<br />
              <strong>Target_Female / Target_Male</strong> = gender-disaggregated target population
            </div>
          </div>

          <div style={{ background: '#f8f8f8', border: '1px solid #e8e8e8', padding: '.8rem 1rem', marginBottom: '.8rem', fontFamily: 'monospace' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '.4rem' }}>Formula (total target only — no gender split)</div>
            <div style={{ fontSize: '0.75rem', color: BLACK, lineHeight: 2 }}>
              Achievement = <strong>(sample_count / sample_size) × Target_Total</strong>
            </div>
            <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '.6rem', paddingTop: '.6rem', fontSize: '0.65rem', color: '#777' }}>
              Used when gender-disaggregated targets are not available for a project.
              <strong> sample_count</strong> = farmers in sample who meet the KPI threshold.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.6rem', marginTop: '.4rem' }}>
            {[
              { kpi: 'S6.1', label: 'Threshold', desc: 'Resilience Index ≥ 18/35 (provisional). From 2027: improvement from 2026 baseline score.' },
              { kpi: 'S6.2', label: 'Threshold', desc: 'Farm Viability Index > 10/30 (>33% of maximum — per monitoring protocol).' },
              { kpi: 'S2.1', label: 'Qualifies if', desc: 'Farmer received ≥1 new service OR at least one service quality improved. Confirmed by SP triangulation.' },
            ].map(({ kpi, label, desc }) => (
              <div key={kpi} style={{ background: '#fffce8', border: '1px solid #ffe57a', padding: '.6rem .8rem' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#888', marginBottom: '.2rem' }}>
                  {kpi} — {label}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#333', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '.8rem', padding: '.6rem .8rem', background: '#fff3e0', border: '1px solid #ffcc80', fontSize: '0.65rem', color: '#6d4c00', lineHeight: 1.7 }}>
            <strong>Baseline year note (2026):</strong> No extrapolation is applied in 2026. Raw sample counts are displayed
            as reference values. The post-stratification estimator activates from 2027 onwards, comparing against
            the 2026 baseline scores.
          </div>
        </Card>
      </Section>

      {/* Index scoring */}
      <Section title="Index Scoring Details" color={NAVY}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888', marginBottom: '.5rem' }}>S6.1 Resilience Index (max 35)</div>
            <table style={{ width: '100%', fontSize: '0.64rem', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '.3rem .5rem', textAlign: 'left', fontWeight: 800 }}>Sub-score</th>
                <th style={{ padding: '.3rem .5rem', textAlign: 'right', fontWeight: 800 }}>Max</th>
                <th style={{ padding: '.3rem .5rem', textAlign: 'left', fontWeight: 800 }}>Source</th>
              </tr></thead>
              <tbody>
                {[
                  ['Soil health (C:N ratio)', '5', 'Lab test — f_S61_soil_C / f_S61_soil_N'],
                  ['Collective membership', '5', 'f_S61_membership (0–5 scale)'],
                  ['Local decision-making', '5', 'f_S61_decision (0–5 scale)'],
                  ['Income: expense coverage', '5', 'f_S61_income_expenses (0–5)'],
                  ['Income: shock resilience', '5', 'Recategorised(impact × recovery)'],
                  ['Income: savings buffer', '5', 'f_S61_income_savings (0–5)'],
                  ['Income diversification', '5', 'f_S61_income_sources (0–5)'],
                ].map(([s, m, src]) => (
                  <tr key={s} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '.3rem .5rem', color: '#333' }}>{s}</td>
                    <td style={{ padding: '.3rem .5rem', textAlign: 'right', fontWeight: 800 }}>{m}</td>
                    <td style={{ padding: '.3rem .5rem', color: '#888', fontSize: '0.6rem' }}>{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: '#888', marginBottom: '.5rem' }}>S6.2 Farm Viability Index (max 30)</div>
            <table style={{ width: '100%', fontSize: '0.64rem', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '.3rem .5rem', textAlign: 'left', fontWeight: 800 }}>Sub-score</th>
                <th style={{ padding: '.3rem .5rem', textAlign: 'right', fontWeight: 800 }}>Max</th>
                <th style={{ padding: '.3rem .5rem', textAlign: 'left', fontWeight: 800 }}>Source</th>
              </tr></thead>
              <tbody>
                {[
                  ['Yield growth', '5', 'f_S62_yield_increase + increase %'],
                  ['Income diversification', '5', 'f_S62_income_diversifcation (0–5)'],
                  ['Income perception', '5', 'f_S62_income_perception (0–5)'],
                  ['Service quality (NPS proxy)', '5', 'f_S62_services_netpromoter (1–10 → 1–5)'],
                  ['Market access', '5', 'f_S62_markets (0–5)'],
                  ['GAP adoption (of 9)', '5', 'Count of f_S62_markets_practices selected'],
                ].map(([s, m, src]) => (
                  <tr key={s} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '.3rem .5rem', color: '#333' }}>{s}</td>
                    <td style={{ padding: '.3rem .5rem', textAlign: 'right', fontWeight: 800 }}>{m}</td>
                    <td style={{ padding: '.3rem .5rem', color: '#888', fontSize: '0.6rem' }}>{src}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </Section>

      {/* Disaggregation */}
      <Section title="Disaggregation" color={ORANGE}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', fontSize: '0.68rem' }}>
            <div>
              <div style={{ fontWeight: 800, color: NAVY, marginBottom: '.35rem' }}>Gender (Female / Male)</div>
              <div style={{ color: '#555', lineHeight: 1.7 }}>
                Required for S6.1, S6.2, S2.1, S2.5. Gender is captured in the Farmer Profile section of the survey form
                (<code>f_profile_gender</code>). The post-stratification estimator uses gender strata when
                gender-disaggregated targets are provided.
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: ORANGE, marginBottom: '.35rem' }}>Youth (≤ 35 years)</div>
              <div style={{ color: '#555', lineHeight: 1.7 }}>
                Required for S6.1, S6.2, S2.1. Youth status is automatically derived from age:
                <code> is_youth = age ≤ 35</code>. Captured via <code>f_profile_age</code> in the farmer survey.
                Youth is a cross-cutting disaggregation applied against the total target population.
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 800, color: GREEN, marginBottom: '.35rem' }}>Country &amp; Commodity</div>
              <div style={{ color: '#555', lineHeight: 1.7 }}>
                Every submission is tagged with a project code which links to a country and commodity.
                The dashboard filter bar lets users slice all KPIs by country (Kenya, Uganda, Tanzania, Ethiopia)
                and by commodity (Coffee, Tea, F&amp;V, Gold, Dairy, etc.).
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* Survey Form — no download button here; button lives on Import CSV tab */}
      <Section title="Survey Form" color={YELLOW}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.5rem' }}>About the Form</div>
            <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.8 }}>
              The <strong>MASP IV Farmer Survey V1.1</strong> covers S6.1, S6.2, S2.1, and S2.5 in a single
              combined interview. It is an XLSForm compatible with <strong>KoboToolbox</strong> and ODK Central.
              Download it from the <a href="/upload" style={{ color: NAVY, fontWeight: 700 }}>Import CSV</a> tab and
              upload to your KoboToolbox account to deploy to enumerators.
            </div>
            <div style={{ marginTop: '.6rem', padding: '.5rem .7rem', background: '#fff3e0', border: '1px solid #ffcc80', fontSize: '0.64rem', color: '#6d4c00' }}>
              <strong>Note:</strong> Separate forms for CSO (S6.3) and Company (S6.4/S6.5) respondents are under development and will be released as V1.2.
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.5rem' }}>Before Deploying</div>
            <div style={{ fontSize: '0.65rem', color: '#555', lineHeight: 1.7 }}>
              <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                <li>Set <code>_project_code</code> to exactly match the code in the Projects table (e.g. <code>KE-ANK-001</code>)</li>
                <li>Confirm enumerators select the correct <code>_country</code> from the dropdown</li>
                <li>Enable GPS on all devices before the first interview</li>
                <li>Run a 3–5 farmer pilot; export and import the pilot CSV to validate before full deployment</li>
                <li>Enter annual targets in <strong>Targets &amp; Achievements</strong> before starting fieldwork so the extrapolation formula has a denominator</li>
              </ul>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.5rem' }}>Exporting from KoboToolbox</div>
            <div style={{ fontSize: '0.65rem', color: '#555', lineHeight: 1.7 }}>
              <ol style={{ paddingLeft: '1.1rem', margin: 0 }}>
                <li>Open your project in KoboToolbox and go to <em>Data → Downloads</em></li>
                <li>Select <strong>CSV</strong> format, all fields, all versions</li>
                <li>Click <em>Export</em> and download the file to your computer</li>
                <li>Upload via the <a href="/upload" style={{ color: NAVY, fontWeight: 700 }}>Import CSV</a> tab — select the survey year and click Upload</li>
              </ol>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.8px', color: '#888', marginBottom: '.5rem' }}>After Uploading</div>
            <div style={{ fontSize: '0.65rem', color: '#555', lineHeight: 1.7 }}>
              Uploaded rows enter a <strong>pending</strong> queue. The <strong>M&amp;E Officer</strong> reviews each
              submission in the <a href="/submissions" style={{ color: NAVY, fontWeight: 700 }}>Submissions</a> page
              for completeness and plausibility before approving. Only <strong>approved</strong> submissions are
              counted in KPI cards and charts. Rejected submissions are flagged with a reason for correction and
              re-upload.
            </div>
          </Card>
        </div>
      </Section>

      {/* Adding a new project */}
      <Section title="Adding a New Project (Targets &amp; Achievements)" color={GREEN}>
        <Card>
          <div style={{ fontSize: '0.68rem', color: '#333', lineHeight: 1.7, marginBottom: '.8rem' }}>
            New projects must be registered in the database before targets can be entered or survey data uploaded.
            Only an <strong>M&amp;E Officer</strong> or <strong>Admin</strong> can add projects. Follow these steps:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.7rem' }}>
            <div>
              <Step n={1} title="Run the SQL insert in Supabase">
                Open the Supabase SQL Editor and run an INSERT into the <code>projects</code> table. Required fields:
                <code> project_code</code> (unique, e.g. <code>KE-NEW-001</code>), <code>project_name</code>,
                <code> country</code>, <code>commodity</code>, <code>start_year</code>, <code>end_year</code>.
                Use the seed file <code>pipeline/masp4_seed_projects_2026.sql</code> as a template.
              </Step>
              <Step n={2} title="Verify commodity and country values">
                <code>country</code> must match exactly: <em>Kenya, Uganda, Tanzania,</em> or <em>Ethiopia</em>.
                <code> commodity</code> must be one of the registered enum values: Coffee, Tea, F&amp;V, Gold, Dairy,
                Leather, Cotton, Fashion, Palm Oil, Cocoa. If your commodity is not listed, add it first with
                <code> ALTER TYPE commodity_enum ADD VALUE IF NOT EXISTS '...'</code>.
              </Step>
              <Step n={3} title="Confirm the project appears in the platform">
                Reload the <strong>Targets &amp; Achievements</strong> tab. The new project should appear as a card.
                If it does not appear, check that <code>country</code> and <code>commodity</code> are spelled
                exactly as the platform expects (case-sensitive).
              </Step>
            </div>
            <div>
              <Step n={4} title="Enter annual outcome KPI targets">
                On the project card in <strong>Targets &amp; Achievements</strong>, click <em>+ Add</em> next to
                each of the 7 outcome KPIs (S6.1–S6.5). Enter the logframe annual target total and, where available,
                gender-disaggregated targets (female / male). Targets are year-specific — enter them for each
                survey year separately.
              </Step>
              <Step n={5} title="Enter the output KPI annual target">
                On the same project card, scroll to the yellow <strong>OUTPUT</strong> section and click
                <em> + Add target</em>. Enter the annual target for Farmers Trained / Reached. This should reflect
                the total headcount across all delivery channels (training events, TV/radio, demo farms, digital)
                as planned for the year.
              </Step>
              <Step n={6} title="Enter quarterly output actuals each quarter">
                At the end of each quarter, enter the actual headcount in the Q1–Q4 tiles of the OUTPUT section.
                Include female and youth disaggregation where available. The annual achievement column sums
                the four quarters automatically and shows a % against the annual target.
              </Step>
            </div>
          </div>
          <div style={{ marginTop: '.7rem', padding: '.6rem .8rem', background: '#e8f5e9', border: '1px solid #a5d6a7', fontSize: '0.64rem', color: '#1b5e20', lineHeight: 1.7 }}>
            <strong>Project codes must be consistent</strong> across the database, the KoboToolbox form (<code>_project_code</code>),
            and any CSV exports. A mismatch will cause uploads to fail with a "project not found" error.
          </div>
        </Card>
      </Section>

      {/* Footer note */}
      <div style={{ borderTop: '1px solid #d0d0d0', paddingTop: '.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ fontSize: '0.6rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '.8px' }}>
          Solidaridad East &amp; Central Africa · MASP IV Data Platform · 2026–2030
        </div>
        <div style={{ fontSize: '0.6rem', color: '#aaa' }}>
          For technical support contact the ECA M&amp;E team
        </div>
      </div>

    </div>
  )
}
