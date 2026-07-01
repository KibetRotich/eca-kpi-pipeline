"""Page h) Farmer-level Depth — unique vs raw, new/returning, session frequency, capture rates."""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, kpi_row, no_data, page_header, section

configure_page("Farmer-level Depth", "🌾")
fd = filtered_data()
page_header("🌾 Farmer-level Depth",
            "Unique reach vs raw attendance, repeat engagement and identity capture.", fd)

ev = fd.events
part = fd.participants
sel = fd.selected_participants
if ev.empty:
    no_data(); st.stop()

# Build a unified farmer↔event table from both sources, keyed by a stable id.
frames = []
if part is not None and not part.empty and "farmer_key" in part:
    frames.append(part[["event_id", "farmer_key", "training_date"]].rename(columns={"farmer_key": "fkey"}))
if sel is not None and not sel.empty and "beneficiary_code" in sel:
    s = sel[["event_id", "beneficiary_code", "training_date"]].copy()
    s["fkey"] = "id:" + s["beneficiary_code"].astype(str)
    frames.append(s[["event_id", "fkey", "training_date"]])

fe = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["event_id", "fkey", "training_date"])
fe = fe.drop_duplicates(subset=["fkey", "event_id"])

raw_individual = len(fe)                       # attendance rows (an individual per event)
unique_farmers = fe["fkey"].nunique()
verified = fe[fe["fkey"].str.startswith("id:")]["fkey"].nunique() if not fe.empty else 0

kpi_row([
    {"label": "Unique farmers (deduped)", "value": f"{unique_farmers:,}",
     "help": "Distinct farmers by Beneficiary ID (or name+phone where no ID). "
             "A farmer attending 3 events counts once."},
    {"label": "Raw attendance records", "value": f"{raw_individual:,}",
     "help": "Individual attendance rows (participant repeat + known-farmer "
             "selections). Sums duplicates across events."},
    {"label": "Total reported reach", "value": f"{fd.total_reach:,}",
     "help": "Σ total_participants (headcount)."},
    {"label": "ID-verified farmers", "value": f"{verified:,}",
     "help": "Unique farmers carrying a Solidaridad Beneficiary ID."},
])
st.caption("Three different denominators — never conflate them. Unique < raw "
           "attendance < reported reach (reach also counts people never recorded "
           "individually).")
st.markdown("---")

if fe.empty:
    st.info("No individual-level farmer records in the current selection.")
    st.stop()

# New vs returning over time (first-seen month)
section("New vs returning farmers over time")
fe2 = fe.dropna(subset=["training_date"]).copy()
if not fe2.empty:
    fe2 = fe2.sort_values("training_date")
    fe2["first_date"] = fe2.groupby("fkey")["training_date"].transform("min")
    fe2["status"] = np.where(fe2["training_date"] <= fe2["first_date"], "New", "Returning")
    fe2["month"] = fe2["training_date"].dt.to_period("M").dt.to_timestamp()
    trend = fe2.groupby(["month", "status"]).size().reset_index(name="farmers")
    fig = px.bar(trend, x="month", y="farmers", color="status", barmode="stack",
                 color_discrete_map={"New": "#2E8B57", "Returning": "#1F4E79"})
    chart(fig, "Monthly attendance split into first-ever appearances (New) vs "
               "farmers seen in an earlier month (Returning). Rising 'Returning' "
               "= deepening engagement.", key="farm_newret")

c1, c2 = st.columns(2)
with c1:
    section("Sessions per farmer")
    freq = fe.groupby("fkey").size().value_counts().sort_index().reset_index()
    freq.columns = ["sessions_attended", "farmers"]
    fig = px.bar(freq, x="sessions_attended", y="farmers")
    chart(fig, f"How many events each unique farmer attended. {unique_farmers:,} "
               f"unique farmers; most attend few sessions (long tail = highly "
               f"engaged).", key="farm_freq")
with c2:
    section("Identity & contact capture")
    if part is not None and not part.empty:
        id_rate = (part["identity_status"] == "verified").mean() * 100
        phone_rate = part["phone_number"].astype("string").str.strip().replace("", np.nan).notna().mean() * 100
        cap = pd.DataFrame({
            "metric": ["Beneficiary ID captured", "Phone number captured"],
            "rate": [id_rate, phone_rate]})
        fig = px.bar(cap, x="rate", y="metric", orientation="h", range_x=(0, 100),
                     color="rate", color_continuous_scale="RdYlGn", range_color=(0, 100))
        chart(fig, f"Capture completeness within the {len(part):,} individually "
                   f"recorded participants (participant repeat). Low ID capture → "
                   f"weaker dedup confidence.", key="farm_capture")
    else:
        st.caption("No participant-repeat records to measure capture rates.")

st.info("**Dedup caveat:** farmers without a Beneficiary ID are matched on "
        "name+phone, which misses spelling variants and shared phones. Treat "
        "unique-farmer counts as a lower-confidence estimate for name-only records "
        "(see Data Dictionary).")
