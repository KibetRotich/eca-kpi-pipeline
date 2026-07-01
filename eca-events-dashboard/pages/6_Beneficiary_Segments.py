"""Page f) Beneficiary Segments — type distribution, co-occurrence, top organisations."""
from __future__ import annotations

from itertools import combinations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, no_data, page_header, section

configure_page("Beneficiary Segments", "👥")
fd = filtered_data()
page_header("👥 Beneficiary Segments", "Who is being engaged, and in what combinations.", fd)

ev = fd.events
bt = fd.multiselect.get("beneficiary_type")
if ev.empty:
    no_data(); st.stop()

section("Beneficiary-type distribution")
if bt is not None and not bt.empty:
    d = bt["label"].value_counts().reset_index()
    d.columns = ["beneficiary_type", "events"]
    fig = px.bar(d.sort_values("events"), x="events", y="beneficiary_type", orientation="h")
    chart(fig, f"Number of events engaging each beneficiary type. Events can target "
               f"multiple types, so totals exceed {ev['event_id'].nunique():,} events.", key="ben_dist")

    # Co-occurrence matrix
    section("Beneficiary-type co-occurrence")
    per_event = bt.groupby("event_id")["label"].apply(lambda s: sorted(set(s)))
    types = sorted(bt["label"].unique().tolist())
    idx = {t: i for i, t in enumerate(types)}
    mat = np.zeros((len(types), len(types)), dtype=int)
    for combo in per_event:
        for t in combo:
            mat[idx[t], idx[t]] += 1
        for a, b in combinations(combo, 2):
            mat[idx[a], idx[b]] += 1
            mat[idx[b], idx[a]] += 1
    co = pd.DataFrame(mat, index=types, columns=types)
    fig = px.imshow(co, text_auto=True, color_continuous_scale="Greens", aspect="auto")
    chart(fig, "How often beneficiary types appear together in the same event "
               "(diagonal = total events for that type). Bright off-diagonal cells "
               "= frequently co-engaged segments.", height=480, key="ben_co")
else:
    st.info("No beneficiary-type data in the current selection.")

# Top organisations / cooperatives
section("Top engaged organisations / cooperatives")
org = ev.get("organization_name")
if org is not None and org.fillna("").str.strip().ne("").any():
    o = (ev.assign(org=org.fillna("").str.strip())
           .query("org != ''")
           .groupby("org").agg(events=("event_id", "size"),
                               reach=("total_participants", "sum")).reset_index()
           .sort_values(["events", "reach"], ascending=False).head(20))
    fig = px.bar(o.sort_values("events"), x="events", y="org", orientation="h",
                 hover_data=["reach"])
    chart(fig, "Most-frequently named partner organisations/cooperatives/groups "
               "(free-text field; spelling variants are not merged).",
          height=max(300, 24*len(o)), key="ben_org")
    with st.expander("⬇️ Export organisation table"):
        download_buttons(o, "eca_organisations", fd.pii_unlocked, key="ben")
else:
    st.caption("No organisation names recorded in the current selection.")
