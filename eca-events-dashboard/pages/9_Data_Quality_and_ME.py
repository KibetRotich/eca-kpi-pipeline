"""Page i) Data Quality & M&E — test/real, missing-field audit, reconciliation, enumerators, timeliness."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data, load_dataset
from components.exports import download_buttons
from components.ui import chart, configure_page, kpi_row, no_data, page_header, section

configure_page("Data Quality & M&E", "🔍")
fd = filtered_data()
page_header("🔍 Data Quality & M&E", "Completeness, reconciliation and field-team performance.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()

# Test vs real — computed on the FULL dataset (the sidebar test filter would
# otherwise hide the thing we're measuring). Programme-wide.
full = load_dataset().events
kpi_row([
    {"label": "Real records", "value": f"{int(full['is_real'].sum()):,}"},
    {"label": "Test records", "value": f"{int(full['is_test'].sum()):,}",
     "help": "Excluded from all analytics by default."},
    {"label": "Test rate", "value": f"{full['is_test'].mean()*100:.1f}%"},
    {"label": "Avg completeness", "value": f"{ev['completeness_score'].mean():.0f}%",
     "help": "Mean of GPS/photo/attendance-sheet/admin-2 presence per event."},
])
st.markdown("---")

section("Test vs real records over time (programme-wide)")
tr = (full.dropna(subset=["training_date"])
          .assign(month=lambda d: d["training_date"].dt.to_period("M").dt.to_timestamp(),
                  kind=lambda d: np.where(d["is_test"], "Test", "Real"))
          .groupby(["month", "kind"]).size().reset_index(name="n"))
if not tr.empty:
    fig = px.bar(tr, x="month", y="n", color="kind", barmode="stack",
                 color_discrete_map={"Real": "#2E8B57", "Test": "#C0504D"})
    chart(fig, "Monthly real vs test submissions across the whole form (not "
               "affected by the sidebar test toggle). Spikes in test = training/UAT.",
          key="dq_testreal")

# Missing-field audit
section("Missing-field audit")
audit = pd.DataFrame({
    "field": ["GPS", "Event photo", "Attendance sheet", "Admin level 2"],
    "% missing": [ev["missing_gps"].mean()*100, ev["missing_photo"].mean()*100,
                  ev["missing_sheet"].mean()*100, ev["missing_admin2"].mean()*100],
})
fig = px.bar(audit.sort_values("% missing"), x="% missing", y="field", orientation="h",
             range_x=(0, 100), color="% missing", color_continuous_scale="Reds", range_color=(0, 100))
chart(fig, f"Share of the {len(ev):,} filtered events missing each key field. "
           f"Higher = weaker verifiability.", key="dq_missing")

# Aggregate vs individual reconciliation
section("Aggregate vs individual reconciliation")
rec = ev.assign(gap=ev["total_participants"].fillna(0) - ev["n_individual_records"].fillna(0))
agg_total = ev["total_participants"].fillna(0).sum()
agg_indiv = ev["n_individual_records"].fillna(0).sum()
c1, c2 = st.columns([1, 1])
with c1:
    fig = px.histogram(rec[rec["total_participants"].notna()], x="gap", nbins=40)
    chart(fig, "Per-event gap = reported reach − individually recorded. Large "
               "positive gaps = many attendees never captured individually.", key="dq_recgap")
with c2:
    comp = pd.DataFrame({"measure": ["Reported reach (Σ total)", "Individually recorded"],
                         "value": [agg_total, agg_indiv]})
    fig = px.bar(comp, x="measure", y="value", color="measure",
                 color_discrete_sequence=["#1F4E79", "#2E8B57"])
    fig.update_layout(showlegend=False)
    cap_rate = agg_indiv/agg_total*100 if agg_total else 0
    chart(fig, f"Programme totals: {agg_indiv:,.0f} of {agg_total:,.0f} reported "
               f"reach captured individually ({cap_rate:.0f}% capture rate).", key="dq_recbar")

# Enumerator performance
section("Enumerator submission counts & completeness")
if "enumarator_names" in ev and ev["enumarator_names"].fillna("").str.strip().ne("").any():
    en = (ev.assign(enum=ev["enumarator_names"].fillna("").str.strip())
            .query("enum != ''")
            .groupby("enum").agg(events=("event_id", "size"),
                                 avg_completeness=("completeness_score", "mean"),
                                 reach=("total_participants", "sum")).reset_index()
            .sort_values("events", ascending=False).head(25))
    st.dataframe(en.style.format({"avg_completeness": "{:.0f}%", "reach": "{:,.0f}"})
                   .background_gradient(subset=["avg_completeness"], cmap="RdYlGn", vmin=0, vmax=100),
                 use_container_width=True, hide_index=True)
    st.caption("Field-staff submission volume and mean data-completeness. Staff "
               "operational metric (not beneficiary PII).")
else:
    st.caption("No enumerator names recorded in the current selection.")

# Timeliness
section("Submission timeliness")
lag = ev["submission_lag_days"].dropna()
lag = lag[(lag >= -2) & (lag <= 120)]
if not lag.empty:
    fig = px.histogram(lag, nbins=40)
    fig.update_layout(showlegend=False, xaxis_title="Days between activity date and submission")
    chart(fig, f"Data-entry lag: days from the activity to its submission "
               f"(median {lag.median():.0f} d). Long lags risk recall error.", key="dq_lag")

with st.expander("⬇️ Export event-level data-quality flags"):
    cols = ["event_id", "country_label", "project_label", "training_date",
            "completeness_score", "missing_gps", "missing_photo", "missing_sheet",
            "missing_admin2", "total_participants", "n_individual_records", "submission_lag_days"]
    download_buttons(ev[[c for c in cols if c in ev.columns]], "eca_data_quality", fd.pii_unlocked, key="dq")
