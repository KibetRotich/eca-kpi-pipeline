"""Page b) Geography — admin-level heat, GPS venue map with clustering, coverage gaps."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import pydeck as pdk
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, no_data, page_header, section

configure_page("Geography", "🗺️")
fd = filtered_data()
page_header("🗺️ Geography", "Where events happen and where coverage is thin.", fd)

ev = fd.events
if ev.empty:
    no_data(); st.stop()

metric = st.radio("Metric", ["Reach", "Events"], horizontal=True, key="geo_metric")
value_col = "total_participants" if metric == "Reach" else None

section("Reach by administrative area")
tmp = ev.copy()
tmp["a1"] = tmp["admin_level_1_label"].replace("", "Unspecified").fillna("Unspecified")
tmp["a2"] = tmp["admin_level_2"].replace("", "Unspecified").fillna("Unspecified")
if metric == "Reach":
    agg = tmp.groupby(["country_label", "a1", "a2"])["total_participants"].sum().reset_index(name="value")
else:
    agg = tmp.groupby(["country_label", "a1", "a2"]).size().reset_index(name="value")
agg = agg[agg["value"] > 0]
if not agg.empty:
    fig = px.treemap(agg, path=[px.Constant("ECA"), "country_label", "a1", "a2"],
                     values="value", color="value", color_continuous_scale="Greens")
    chart(fig, f"{metric} by country → admin-1 → admin-2 (treemap acts as a heat "
               f"map by admin level; true choropleth needs boundary files — see "
               f"Data Dictionary). n = {len(ev):,} events.", height=460, key="geo_tree")

# GPS venue map with clustering
section("Event venue locations (GPS)")
pts = ev.dropna(subset=["lat", "lon"])
pts = pts[(pts["lat"].between(-15, 25)) & (pts["lon"].between(20, 55))]  # ECA bbox sanity
if pts.empty:
    st.info("No valid GPS points in the current selection.")
else:
    view = "Cluster (hexbin)" if len(pts) > 50 else "Points"
    view = st.radio("Map style", ["Cluster (hexbin)", "Points"],
                    index=0 if view == "Cluster (hexbin)" else 1, horizontal=True, key="geo_mapstyle")
    mid = pdk.ViewState(latitude=float(pts["lat"].mean()), longitude=float(pts["lon"].mean()), zoom=4.2)
    if view == "Cluster (hexbin)":
        layer = pdk.Layer("HexagonLayer", data=pts[["lat", "lon"]], get_position="[lon, lat]",
                          radius=15000, elevation_scale=40, extruded=True, pickable=True,
                          coverage=0.9)
    else:
        layer = pdk.Layer("ScatterplotLayer", data=pts[["lat", "lon", "training_location"]],
                          get_position="[lon, lat]", get_radius=6000, get_fill_color="[46,139,87,160]",
                          pickable=True)
    st.pydeck_chart(pdk.Deck(layers=[layer], initial_view_state=mid, map_style=None,
                             tooltip={"text": "Venue"}))
    st.caption(f"{len(pts):,} of {len(ev):,} events carry a valid venue GPS point "
               f"({len(pts)/len(ev)*100:.0f}% GPS capture). Hexbin bins nearby "
               f"venues; height/colour = event density.")

# Coverage-gap table
section("Coverage-gap table (lowest activity)")
gap = (tmp.groupby(["country_label", "a1"])
          .agg(events=("event_id", "size"), reach=("total_participants", "sum"))
          .reset_index().sort_values(["events", "reach"]))
st.dataframe(gap.head(20).style.format({"reach": "{:,.0f}"}), use_container_width=True, hide_index=True)
st.caption("Admin-1 areas with the fewest events/reach in the current filter — "
           "candidate gaps for planning. Zero-activity areas not present in the "
           "data cannot be listed here (no submissions = no row).")

with st.expander("⬇️ Export admin-area aggregates"):
    download_buttons(agg.rename(columns={"value": metric.lower()}), "eca_geography", fd.pii_unlocked, key="geo")
