"""
ECA Trainings & Events Tracker — Analytics Dashboard (Home).

Run:  streamlit run app.py
Data: reads the local processed cache (populated from the KoBoToolbox MCP
server) and falls back to a bundled synthetic dataset for offline dev.
"""
from __future__ import annotations

import streamlit as st

from components.data_access import filtered_data
from components.ui import chart, configure_page, page_header
import plotly.express as px

configure_page("Home", "🌱")

fd = filtered_data()

page_header(
    "🌱 ECA Trainings & Events Tracker",
    "Solidaridad East & Central Africa — training and event delivery analytics "
    "across Kenya, Uganda, Tanzania and Ethiopia.",
    fd,
)

st.markdown(
    """
Use the **pages in the sidebar** to explore delivery, reach, geography, gender &
youth inclusion, curriculum coverage, facilitators, farmer-level depth, data
quality and planning. The **global filters** in the sidebar apply to every page.

> **Reading the numbers.** *Total reach* is the aggregate headcount reported per
> event (`total_participants`). It is **not** the same as the number of
> individually recorded participants (the demographic sample, `n`). Charts built
> from individual records always show their `n`. See the **Data Dictionary &
> Methodology** page for definitions and known limitations.
    """
)

st.markdown("---")

if fd.n_events == 0:
    st.info("No events match the current filters. Widen the selection in the sidebar.")
    st.stop()

# A quick at-a-glance trend so Home isn't empty.
ev = fd.events
c1, c2 = st.columns(2)
with c1:
    st.subheader("Events per month")
    m = (ev.dropna(subset=["training_date"])
           .assign(month=lambda d: d["training_date"].dt.to_period("M").dt.to_timestamp())
           .groupby("month").size().reset_index(name="events"))
    if not m.empty:
        fig = px.area(m, x="month", y="events", markers=True)
        chart(fig, f"Monthly event count. n = {len(ev):,} events in the current filter.",
              height=300, key="home_trend")
with c2:
    st.subheader("Reach by country")
    r = (ev.groupby("country_label")["total_participants"].sum()
           .sort_values(ascending=False).reset_index())
    if not r.empty:
        fig = px.bar(r, x="country_label", y="total_participants")
        chart(fig, "Aggregate reported reach (Σ total_participants) by country.",
              height=300, key="home_country")

st.caption("Navigate to any page in the left sidebar to begin. All exports and "
           "shared views mask personally identifiable information by default.")
