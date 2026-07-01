"""Page: Data Dictionary & Methodology — definitions, caveats, refresh + PII policy."""
from __future__ import annotations

import pandas as pd
import streamlit as st

from components.data_access import load_dataset
from components.ui import configure_page, section
from config import ADMIN_LEVELS
from data_pipeline.decode import get_decoder

configure_page("Data Dictionary", "📖")
st.title("📖 Data Dictionary & Methodology")

ds = load_dataset()
st.caption(f"Source: `{ds.meta.get('source')}` · "
           f"raw records: {ds.meta.get('raw_count'):,} · "
           f"real: {ds.meta.get('real_count'):,} · test: {ds.meta.get('test_count'):,} · "
           f"choices map: {'PROVISIONAL' if ds.choices_are_provisional else 'authoritative'}")

section("The three reach numbers — do not conflate")
st.markdown(
    """
| Metric | Definition | Use it for |
|---|---|---|
| **Reported reach** | Σ `total_participants` — the headcount the facilitator reports per event. | Programme reach / KPI totals. |
| **Individually recorded (n)** | Count of participant rows captured individually (the `participant` repeat) **+** known-farmer list selections. | Demographic breakdowns — always shown with its `n`. |
| **Unique farmers (deduped)** | Distinct people after de-duplication by Beneficiary ID (or name+phone). | "How many different people did we reach". |

`Reported reach ≥ raw individual records ≥ unique farmers`. Demographic
percentages (%female, %youth) are computed from **event-level headcounts**
(`female_participants`, `youth_participants` over `total_participants`) — the
most complete reach-based figure — **not** from the smaller individual sample.
    """)

section("Key derived fields")
st.markdown(
    """
- **% Female / % Youth** — `female_participants` / `youth_participants` ÷ `total_participants` (event level).
- **youth_participants** — form calculation; back-filled as `male_youth + female_youth` when absent.
- **Individual-record capture rate** — (participant-repeat rows + known-farmer selections) ÷ `total_participants`, capped at 100%.
- **Completeness score** — mean presence of {GPS, event photo, attendance sheet, admin level 2} per event.
- **Submission lag** — days between `training_date` and the KoBo `_submission_time`.
- **identity_status** — `verified` if a Beneficiary ID (`farmer_id`) is present, else `unverified` (name-only).
    """)

section("Country-conditional administrative levels")
st.markdown("When the form's calculated `admin_level_N_title` is present it is "
            "used verbatim; otherwise this fallback map applies:")
st.dataframe(pd.DataFrame(ADMIN_LEVELS).T.rename(columns={"1": "Level 1", "2": "Level 2", "3": "Level 3"}),
             use_container_width=True)

section("Multi-select fields (exploded to long format)")
st.markdown("`beneficiary_type`, `training_topic`, `training_modules` are "
            "space-delimited codes; each event can select several. They are "
            "exploded so counts are by *selection*, so per-field totals exceed "
            "the event count. `selected_participants` tokens are "
            "`internal_id__BeneficiaryCode`.")

section("Known limitations")
st.markdown(
    """
- **Free-text dedup.** Farmers without a Beneficiary ID are matched on
  name+phone; spelling variants, shared phones and blanks are **not** merged, so
  unique-farmer counts for name-only records are a lower-confidence estimate.
- **Version drift.** The form evolved: early records lack `real_test`,
  `event_type`, headcount fields and use the inline `participant` repeat; newer
  records use the known-farmer list. Missing fields are tolerated, not imputed.
- **Records with no `real_test`** are treated as **real** (the field post-dates them).
- **No true choropleth.** Admin boundary GeoJSON is not bundled; the Geography
  page uses a treemap heat map + GPS point/hexbin map instead.
- **Organisation names** are free text — not canonicalised.
- **`next_training_date`** is populated by only some projects → partial pipeline.
    """)

section("PII protection")
st.markdown(
    """
Phone numbers and Beneficiary/National IDs are **masked**; participant and
facilitator names are **dropped**; **disability** is shown only in aggregate.
Row-level PII is available only behind the sidebar's *Restricted detail* gate for
authorised 1:1 verification, and is never included in shared exports unless
unlocked.
    """)

section("Data refresh")
st.markdown(
    """
The dashboard reads a processed cache built from **KoBoToolbox** submissions
pulled through the connected **MCP server** (`get_submissions`). To refresh:

1. **Interactive (MCP):** run `tools/refresh_data.py` — it pages through all
   submissions via the MCP tool and rewrites the local cache; `st.cache_data`
   then serves the new data (TTL = 1h by default).
2. **Choices/labels:** run `tools/refresh_choices.py` to regenerate
   `choices.json` from the live form's `choices` sheet (MCP `get_form_content`).
3. **Headless/cron fallback:** `python data_pipeline/ingest.py --live` with
   `KOBO_TOKEN` set (documented fallback when the MCP server isn't available).

See the README to point the dashboard at a new form or add a project/topic.
    """)

section("Browse the current decode map")
decoder = get_decoder()
if decoder.lists:
    lst = st.selectbox("Choice list", sorted(decoder.lists.keys()))
    dfm = pd.DataFrame([{"code": k, "label": v} for k, v in decoder.lists[lst].items()])
    st.dataframe(dfm, use_container_width=True, hide_index=True)
else:
    st.caption("No choice lists loaded.")
