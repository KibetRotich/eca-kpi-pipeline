"""Page j) Time & Planning — seasonality heat map, delivery cadence, upcoming pipeline."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, no_data, page_header, section

configure_page("Time & Planning", "🗓️")
fd = filtered_data()
page_header("🗓️ Time & Planning", "Seasonality, delivery cadence and the upcoming event pipeline.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()

dated = ev.dropna(subset=["training_date"]).copy()

# Seasonality heat map
section("Seasonality heat map")
dim = st.radio("Rows", ["Project", "Commodity group", "Country"], horizontal=True, key="tp_dim")
col = {"Project": "project_label", "Commodity group": "project_commodity_category_label",
       "Country": "country_label"}[dim]
measure = st.radio("Cell value", ["Events", "Reach"], horizontal=True, key="tp_measure")
if not dated.empty:
    dated["month_name"] = dated["training_date"].dt.month
    grp = dated.assign(dimv=dated[col].replace("", "Unspecified").fillna("Unspecified"))
    if measure == "Events":
        pivot = grp.pivot_table(index="dimv", columns="month_name", values="event_id",
                                aggfunc="count", fill_value=0)
    else:
        pivot = grp.pivot_table(index="dimv", columns="month_name", values="total_participants",
                                aggfunc="sum", fill_value=0)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    pivot = pivot.reindex(columns=range(1, 13), fill_value=0)
    pivot.columns = months
    fig = px.imshow(pivot, color_continuous_scale="Greens", aspect="auto", text_auto=True)
    chart(fig, f"{measure} by calendar month (aggregated across all years) × {dim.lower()}. "
               f"Reveals seasonal peaks — align planning with delivery windows.",
          height=max(300, 34*len(pivot)), key="tp_heat")

# Delivery cadence
section("Delivery cadence")
if not dated.empty:
    span = (dated["training_date"].max() - dated["training_date"].min()).days
    months_span = max(span / 30.44, 1)
    cad = (dated.groupby("project_label")
                .agg(events=("event_id", "size"),
                     first=("training_date", "min"), last=("training_date", "max")).reset_index())
    cad["active_months"] = ((cad["last"] - cad["first"]).dt.days / 30.44).clip(lower=1)
    cad["events/month"] = (cad["events"] / cad["active_months"]).round(2)
    cad = cad.sort_values("events/month", ascending=True)
    fig = px.bar(cad, x="events/month", y="project_label", orientation="h")
    chart(fig, "Delivery pace per project = events ÷ active months (first→last "
               "event). Higher = more frequent delivery.", height=max(300, 26*len(cad)), key="tp_cad")

# Upcoming pipeline
section("Upcoming event pipeline")
st.caption("From `next_training_date`. Note: only some projects/records populate "
           "this field (e.g. save_ke), so this is a partial pipeline, not a "
           "complete forward plan.")
today = pd.Timestamp(pd.Timestamp.today().date())
upc = ev[ev["next_training_date"].notna() & (ev["next_training_date"] >= today)].copy()
if not upc.empty:
    upc["month"] = upc["next_training_date"].dt.to_period("M").dt.to_timestamp()
    pipe = upc.groupby(["month", "country_label"]).size().reset_index(name="planned_events")
    fig = px.bar(pipe, x="month", y="planned_events", color="country_label")
    chart(fig, f"{len(upc):,} events have a future proposed date, by month and country.",
          key="tp_pipe")
    show = upc[["next_training_date", "country_label", "project_label",
                "admin_level_1_label", "training_title"]].sort_values("next_training_date")
    st.dataframe(show, use_container_width=True, hide_index=True)
    with st.expander("⬇️ Export upcoming pipeline"):
        download_buttons(show, "eca_upcoming_pipeline", fd.pii_unlocked, key="tp")
else:
    st.info("No events with a future proposed next-training date in the current selection.")
