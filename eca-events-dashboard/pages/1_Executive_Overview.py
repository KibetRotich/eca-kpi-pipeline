"""Page a) Executive Overview — headline KPIs, reach trend, event mix, country scorecard."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, kpi_row, no_data, page_header, section

configure_page("Executive Overview", "📈")
fd = filtered_data()
page_header("📈 Executive Overview", "Programme-wide delivery and reach at a glance.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()


def _pct(numer, denom):
    return f"{(numer / denom * 100):.1f}%" if denom else "—"


total_reach = fd.total_reach
female = ev["female_participants"].fillna(0).sum()
youth = ev["youth_participants"].fillna(0).sum()

# Period-over-period: latest month vs previous month within the filtered set.
monthly = (ev.dropna(subset=["training_date"])
             .assign(m=lambda d: d["training_date"].dt.to_period("M"))
             .groupby("m").agg(events=("event_id", "size"),
                               reach=("total_participants", "sum")).sort_index())
ev_delta = reach_delta = None
if len(monthly) >= 2:
    cur, prev = monthly.iloc[-1], monthly.iloc[-2]
    ev_delta = f"{cur['events'] - prev['events']:+.0f} vs prev month"
    if prev["reach"]:
        reach_delta = f"{(cur['reach'] - prev['reach']) / prev['reach'] * 100:+.1f}% vs prev month"

kpi_row([
    {"label": "Total events", "value": f"{len(ev):,}", "delta": ev_delta},
    {"label": "Total reach", "value": f"{total_reach:,}", "delta": reach_delta,
     "help": "Σ total_participants (aggregate headcount, not unique people)."},
    {"label": "% Female", "value": _pct(female, total_reach),
     "help": "Share of reported reach that is female (event-level headcounts)."},
    {"label": "% Youth (≤35)", "value": _pct(youth, total_reach)},
    {"label": "Active countries", "value": f"{ev['country_label'].nunique()}"},
    {"label": "Active projects", "value": f"{ev['project_label'].nunique()}"},
])
st.markdown("---")

# Reach + events trend
section("Reach & events over time")
if not monthly.empty:
    md = monthly.reset_index()
    md["month"] = md["m"].dt.to_timestamp()
    fig = px.line(md, x="month", y="reach", markers=True)
    fig.add_bar(x=md["month"], y=md["events"], name="events", yaxis="y2", opacity=0.35)
    fig.update_layout(yaxis=dict(title="Reach (Σ participants)"),
                      yaxis2=dict(title="Events", overlaying="y", side="right", showgrid=False))
    chart(fig, f"Monthly reported reach (line) and event count (bars). "
               f"{len(ev):,} events. Reach = aggregate headcount.", key="exec_trend")

c1, c2 = st.columns([1, 1])
with c1:
    section("Event-type breakdown")
    et = ev["event_type_label"].replace("", "Unspecified").value_counts().reset_index()
    et.columns = ["event_type", "events"]
    fig = px.pie(et, names="event_type", values="events", hole=0.5)
    chart(fig, "Distribution of events by type. Older records may lack an "
               "event type ('Unspecified').", key="exec_ettype")
with c2:
    section("Reach by event type")
    er = ev.groupby(ev["event_type_label"].replace("", "Unspecified"))["total_participants"].sum().sort_values(ascending=True).reset_index()
    er.columns = ["event_type", "reach"]
    fig = px.bar(er, x="reach", y="event_type", orientation="h")
    chart(fig, "Aggregate reach by event type.", key="exec_etreach")

# Country scorecard
section("Country comparison scorecard")
def _country_scorecard(df):
    g = df.groupby("country_label")
    out = pd.DataFrame({
        "Events": g.size(),
        "Reach": g["total_participants"].sum(),
        "% Female": g.apply(lambda x: x["female_participants"].sum() / x["total_participants"].sum() * 100
                            if x["total_participants"].sum() else float("nan"), include_groups=False),
        "% Youth": g.apply(lambda x: x["youth_participants"].sum() / x["total_participants"].sum() * 100
                           if x["total_participants"].sum() else float("nan"), include_groups=False),
        "Avg reach/event": g["total_participants"].mean(),
    }).reset_index().rename(columns={"country_label": "Country"})
    return out.sort_values("Reach", ascending=False)

score = _country_scorecard(ev)
st.dataframe(
    score.style.format({"Reach": "{:,.0f}", "Events": "{:,.0f}", "% Female": "{:.1f}%",
                        "% Youth": "{:.1f}%", "Avg reach/event": "{:.1f}"})
        .background_gradient(subset=["% Female", "% Youth"], cmap="Greens"),
    use_container_width=True, hide_index=True)
st.caption("Per-country delivery scorecard. % Female/Youth are of reported reach.")

with st.expander("⬇️ Export filtered event-level data"):
    export_cols = ["event_id", "training_date", "country_label", "admin_level_1_label",
                   "admin_level_2", "project_label", "project_commodity_category_label",
                   "event_type_label", "training_type_label", "training_title",
                   "total_participants", "female_participants", "youth_participants",
                   "pct_female", "pct_youth", "n_individual_records",
                   "individual_capture_rate", "completeness_score", "is_real"]
    download_buttons(ev[[c for c in export_cols if c in ev.columns]],
                     "eca_events_filtered", fd.pii_unlocked, key="exec")
