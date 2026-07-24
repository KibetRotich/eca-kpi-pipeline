/** Data dictionary & methodology — field definitions, caveats, PII policy. */
export const dynamic = 'force-dynamic'

const cell: React.CSSProperties = { padding: '.35rem .7rem', borderTop: '1px solid #f0f0f0', verticalAlign: 'top' }
const th: React.CSSProperties = { padding: '.4rem .7rem', textAlign: 'left', background: '#faf7ea', color: '#666' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cc" style={{ padding: 0, overflow: 'hidden', marginBottom: '.8rem' }}>
      <div style={{ background: '#111', color: '#fff', padding: '.5rem .8rem', fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>{title}</div>
      <div style={{ padding: '.7rem .9rem', fontSize: '.75rem', lineHeight: 1.6, color: '#333' }}>{children}</div>
    </div>
  )
}

const FIELDS: [string, string][] = [
  ['event / submission', 'One KoboToolbox submission = one training or event delivered.'],
  ['total_participants', 'Reported aggregate headcount for the event. NOT the number of individually recorded participants.'],
  ['individual records', 'Sum of participant[] repeat rows + known-farmer-list selections — people captured individually.'],
  ['unique farmers', 'Individual records deduplicated by farmer_id (or a normalised name+phone key when no ID).'],
  ['% female / % youth', 'Of reported reach (total_participants). Youth = ≤35 years.'],
  ['real vs test', 'The real_test field. Test records are excluded everywhere by default; toggle to include.'],
  ['admin levels', 'Country-conditional: Kenya County/Sub-county/Ward · Uganda & Tanzania Region/District · Ethiopia Region/Zone/Woreda.'],
  ['completeness score', 'Mean of four present/absent signals: GPS, photo, attendance sheet, admin-2.'],
  ['submission lag', 'Days between training_date and submission timestamp — a data-entry timeliness proxy.'],
]

export default function DictionaryPage() {
  return (
    <div style={{ maxWidth: 900 }}>
      <Section title="The reach-vs-individual distinction (read this first)">
        The dashboard never conflates three different denominators:
        <div style={{ margin: '.5rem 0', padding: '.5rem .7rem', background: '#faf7ea', fontWeight: 700 }}>
          Reported reach (Σ total_participants) ≥ individual records ≥ unique farmers (deduped)
        </div>
        Demographic percentages are computed on <strong>reported reach</strong>. Charts state their sample
        size (n). Unique-farmer counts are approximate where identity rests on typed names rather than a
        farmer ID.
      </Section>

      <Section title="Field definitions">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
          <thead><tr><th style={th}>Field</th><th style={th}>Meaning</th></tr></thead>
          <tbody>{FIELDS.map(([k, v]) => <tr key={k}><td style={{ ...cell, fontWeight: 700, whiteSpace: 'nowrap' }}>{k}</td><td style={cell}>{v}</td></tr>)}</tbody>
        </table>
      </Section>

      <Section title="PII protection">
        Row-level phone numbers, Beneficiary IDs, National IDs and participant/facilitator names are held in
        RLS-locked base tables and are <strong>never</strong> exposed to the dashboard — it reads only PII-free
        views (identity is surfaced as an anonymous hash for dedup counting). Disability is shown only in
        aggregate. Enumerator names appear only as aggregate submission/completeness counts.
      </Section>

      <Section title="Known limitations">
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>Free-text dedup (name+phone) is imperfect — unique counts are indicative.</li>
          <li>Admin-2 and organisation names are free-text; spellings vary.</li>
          <li>Form-version drift: older submissions may lack newer fields (handled as missing, treated as real).</li>
          <li>No choropleth boundaries — Geography uses admin-level aggregates and a coordinate scatter, not a basemap.</li>
          <li>next_training_date (upcoming pipeline) is captured mainly by SAVE KE.</li>
        </ul>
      </Section>

      <Section title="Data refresh">
        Source: KoboToolbox form <code>aCt5s6EGUnE7UxJVeuXjpY</code>. A scheduled GitHub Action re-fetches all
        submissions every 3 hours (Kobo REST) and upserts into Supabase; interactive loads run via the Kobo MCP
        server. The “last data refresh” time is shown in the header. New projects/topics decode automatically
        once the choices map is refreshed.
      </Section>
    </div>
  )
}
