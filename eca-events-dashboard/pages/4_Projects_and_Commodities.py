"""Page d) Projects & Commodities — league table, commodity comparison."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, no_data, page_header, section

configure_page("Projects & Commodities", "🏗️")
fd = filtered_data()
page_header("🏗️ Projects & Commodities", "Delivery and reach by project and commodity group.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()

c1, c2 = st.columns(2)
with c1:
    section("Reach by project")
    p = ev.groupby("project_label")["total_participants"].sum().sort_values().reset_index()
    fig = px.bar(p, x="total_participants", y="project_label", orientation="h")
    chart(fig, "Aggregate reported reach by project.", height=max(300, 26*len(p)), key="pc_preach")
with c2:
    section("Reach by commodity group")
    cm = ev.assign(c=ev["project_commodity_category_label"].replace("", "Unspecified"))
    cg = cm.groupby("c")["total_participants"].sum().sort_values(ascending=False).reset_index()
    fig = px.pie(cg, names="c", values="total_participants", hole=0.5)
    chart(fig, "Reach split by commodity category. 'Unspecified' = older records "
               "without the commodity calc field.", key="pc_comm")

section("Commodity comparison (specific commodity)")
spec = ev.assign(s=ev["project_commodity_specific_label"].replace("", "Unspecified"))
sg = (spec.groupby("s").agg(events=("event_id", "size"), reach=("total_participants", "sum"),
                            female=("female_participants", "sum")).reset_index())
sg = sg[sg["s"] != "Unspecified"].sort_values("reach", ascending=False)
if not sg.empty:
    sg["% Female"] = (sg["female"] / sg["reach"] * 100).round(1)
    fig = px.scatter(sg, x="events", y="reach", size="reach", color="% Female",
                     hover_name="s", color_continuous_scale="RdYlGn", range_color=(0, 100),
                     size_max=50)
    chart(fig, "Each bubble = a specific commodity. X = events, Y = reach, "
               "colour = female share. Top-right = high-volume commodities.", key="pc_bubble")

section("Project league table")
def _league(df):
    g = df.groupby("project_label")
    span_days = (df["training_date"].max() - df["training_date"].min()).days if df["training_date"].notna().any() else 0
    months = max(span_days / 30.44, 1)
    out = pd.DataFrame({
        "Events": g.size(),
        "Reach": g["total_participants"].sum(),
        "Avg reach/event": g["total_participants"].mean(),
        "% Female": g.apply(lambda x: x["female_participants"].sum()/x["total_participants"].sum()*100
                            if x["total_participants"].sum() else float("nan"), include_groups=False),
        "% Youth": g.apply(lambda x: x["youth_participants"].sum()/x["total_participants"].sum()*100
                           if x["total_participants"].sum() else float("nan"), include_groups=False),
    })
    out["Events/month"] = (out["Events"] / months).round(2)
    return out.reset_index().rename(columns={"project_label": "Project"}).sort_values("Reach", ascending=False)

league = _league(ev)
st.dataframe(
    league.style.format({"Reach": "{:,.0f}", "Events": "{:,.0f}", "Avg reach/event": "{:.1f}",
                        "% Female": "{:.1f}%", "% Youth": "{:.1f}%"})
        .background_gradient(subset=["Reach"], cmap="Blues"),
    use_container_width=True, hide_index=True)
st.caption("Events/month uses the filtered date span. % Female/Youth of reported reach.")

with st.expander("⬇️ Export project league table"):
    download_buttons(league, "eca_project_league", fd.pii_unlocked, key="pc")
