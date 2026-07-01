"""Page c) Gender & Youth — inclusion trends, cross-tabs, project parity ranking."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, kpi_row, no_data, page_header, section

configure_page("Gender & Youth", "⚖️")
fd = filtered_data()
page_header("⚖️ Gender & Youth Inclusion",
            "Female and youth participation across time, event types and projects.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()

reach = ev["total_participants"].fillna(0).sum()
female = ev["female_participants"].fillna(0).sum()
youth = ev["youth_participants"].fillna(0).sum()
fyouth = ev["female_youth_participants"].fillna(0).sum()

kpi_row([
    {"label": "% Female (of reach)", "value": f"{female/reach*100:.1f}%" if reach else "—"},
    {"label": "% Youth (of reach)", "value": f"{youth/reach*100:.1f}%" if reach else "—"},
    {"label": "% Female youth", "value": f"{fyouth/reach*100:.1f}%" if reach else "—",
     "help": "Female youth as a share of total reach."},
    {"label": "Events w/ ≥50% female", "value": f"{(ev['pct_female'] >= 50).mean()*100:.0f}%",
     "help": "Share of events where women were at least half of participants."},
])
st.caption("All percentages use event-level headcounts (reported reach), not the "
           "smaller individually-recorded sample.")
st.markdown("---")

# Trends
monthly = (ev.dropna(subset=["training_date"])
             .assign(m=lambda d: d["training_date"].dt.to_period("M").dt.to_timestamp())
             .groupby("m").agg(reach=("total_participants", "sum"),
                               female=("female_participants", "sum"),
                               youth=("youth_participants", "sum")).reset_index())
if not monthly.empty:
    monthly["% Female"] = monthly["female"] / monthly["reach"] * 100
    monthly["% Youth"] = monthly["youth"] / monthly["reach"] * 100
    c1, c2 = st.columns(2)
    with c1:
        section("Gender ratio over time")
        fig = px.line(monthly, x="m", y="% Female", markers=True)
        fig.add_hline(y=50, line_dash="dash", line_color="grey", annotation_text="parity (50%)")
        chart(fig, "Monthly female share of reported reach. Dashed line = gender parity.",
              key="gy_ftrend")
    with c2:
        section("Youth participation over time")
        fig = px.line(monthly, x="m", y="% Youth", markers=True, color_discrete_sequence=["#E1A100"])
        chart(fig, "Monthly youth (≤35) share of reported reach.", key="gy_ytrend")

# Gender by event type (cross-tab on reach)
section("Gender by event type")
et = (ev.assign(et=ev["event_type_label"].replace("", "Unspecified"))
        .groupby("et").agg(female=("female_participants", "sum"),
                           reach=("total_participants", "sum")).reset_index())
et["male"] = (et["reach"] - et["female"]).clip(lower=0)
if not et.empty:
    long = et.melt(id_vars="et", value_vars=["female", "male"], var_name="gender", value_name="n")
    fig = px.bar(long, x="et", y="n", color="gender", barmode="stack",
                 color_discrete_map={"female": "#C0504D", "male": "#1F4E79"})
    chart(fig, "Female vs male reported reach by event type (male = reach − female).",
          key="gy_ct")

# Project parity ranking
section("Project gender-parity ranking")
proj = (ev.groupby("project_label")
          .agg(events=("event_id", "size"), reach=("total_participants", "sum"),
               female=("female_participants", "sum"), youth=("youth_participants", "sum"))
          .reset_index())
proj = proj[proj["reach"] > 0]
proj["% Female"] = proj["female"] / proj["reach"] * 100
proj["% Youth"] = proj["youth"] / proj["reach"] * 100
proj = proj.sort_values("% Female", ascending=True)
if not proj.empty:
    fig = px.bar(proj, x="% Female", y="project_label", orientation="h",
                 color="% Female", color_continuous_scale="RdYlGn", range_color=(0, 100))
    fig.add_vline(x=50, line_dash="dash", line_color="grey")
    chart(fig, "Projects ranked by female share of reach (dashed = parity). "
               "Bar length compares directly against 50%.", height=max(300, 26*len(proj)),
          key="gy_proj")
    st.dataframe(
        proj[["project_label", "events", "reach", "% Female", "% Youth"]]
        .sort_values("% Female", ascending=False)
        .style.format({"reach": "{:,.0f}", "% Female": "{:.1f}%", "% Youth": "{:.1f}%"}),
        use_container_width=True, hide_index=True)

with st.expander("⬇️ Export project gender/youth table"):
    download_buttons(proj, "eca_gender_youth_by_project", fd.pii_unlocked, key="gy")
