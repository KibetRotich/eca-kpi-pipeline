"""Page g) Facilitators — type mix, ToT cascade ratio, facilitator:participant ratio."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, kpi_row, no_data, page_header, section

configure_page("Facilitators", "🧑‍🏫")
fd = filtered_data()
page_header("🧑‍🏫 Facilitators & Trainers", "Who delivers the events and how the cascade model is working.", fd)

ev = fd.events
fac = fd.facilitators
if ev.empty:
    no_data(); st.stop()
if fac is None or fac.empty:
    st.info("No facilitator records in the current selection."); st.stop()

# Cascade indicator: lead-farmer / ToT facilitators vs staff.
is_tot = fac["facilitator_type"].astype("string").str.lower().str.contains("tot|lead_farmer", regex=True, na=False)
n_partner_orgs = fac["organization"].fillna("").str.strip().replace("", np.nan).nunique() if "organization" in fac else 0
ratio = ev["total_participants"].sum() / len(fac) if len(fac) else np.nan

kpi_row([
    {"label": "Facilitator records", "value": f"{len(fac):,}"},
    {"label": "ToT / lead-farmer share", "value": f"{is_tot.mean()*100:.0f}%",
     "help": "Cascade indicator: share of facilitators who are ToTs/lead farmers "
             "rather than Solidaridad/partner staff."},
    {"label": "Participants per facilitator", "value": f"{ratio:.0f}" if pd.notna(ratio) else "—",
     "help": "Total reported reach ÷ facilitator records."},
    {"label": "Distinct partner orgs", "value": f"{n_partner_orgs:,}"},
])
st.markdown("---")

c1, c2 = st.columns(2)
with c1:
    section("Facilitator-type mix")
    m = fac["facilitator_type_label"].replace("", "Unspecified").value_counts().reset_index()
    m.columns = ["type", "count"]
    fig = px.pie(m, names="type", values="count", hole=0.5)
    chart(fig, "Composition of facilitators/trainers by type.", key="fac_mix")
with c2:
    section("Facilitator:participant ratio by event")
    tmp = ev.assign(ratio=ev["total_participants"] / ev["n_facilitators"].replace(0, np.nan))
    tmp = tmp[tmp["ratio"].notna() & np.isfinite(tmp["ratio"])]
    fig = px.histogram(tmp, x="ratio", nbins=30)
    chart(fig, "Distribution of participants-per-facilitator across events. "
               "High values may indicate under-staffed sessions.", key="fac_ratio")

# Cascade ratio over time
section("ToT / lead-farmer cascade ratio over time")
if "month" in fac.columns:
    fm = fac.assign(is_tot=is_tot).dropna(subset=["month"])
    trend = fm.groupby("month").agg(tot=("is_tot", "sum"), total=("is_tot", "size")).reset_index()
    trend["% ToT/lead-farmer"] = trend["tot"] / trend["total"] * 100
    trend["month_ts"] = pd.PeriodIndex(trend["month"], freq="M").to_timestamp()
    trend = trend.sort_values("month_ts")
    fig = px.line(trend, x="month_ts", y="% ToT/lead-farmer", markers=True,
                  color_discrete_sequence=["#2E8B57"])
    chart(fig, "Monthly share of facilitators who are ToTs/lead farmers — rising "
               "trend = deepening farmer-to-farmer cascade.", key="fac_cascade")

with st.expander("⬇️ Export facilitator-type summary"):
    download_buttons(fac["facilitator_type_label"].value_counts().reset_index(),
                     "eca_facilitators", fd.pii_unlocked, key="fac")
