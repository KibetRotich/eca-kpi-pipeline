"""Page e) Curriculum & Content — topics, curriculum-gap, manuals, CFA modules, free-text."""
from __future__ import annotations

import re
from collections import Counter

import pandas as pd
import plotly.express as px
import streamlit as st

from components.data_access import filtered_data
from components.exports import download_buttons
from components.ui import chart, configure_page, no_data, page_header, section
from data_pipeline.decode import get_decoder

configure_page("Curriculum & Content", "📚")
fd = filtered_data()
page_header("📚 Curriculum & Content", "What is being taught, with which tools, and what's missing.", fd)

ev = fd.events
topics = fd.multiselect.get("training_topic")
modules = fd.multiselect.get("training_modules")
if ev.empty:
    no_data(); st.stop()

# Top / bottom topics
section("Training topics covered")
if topics is not None and not topics.empty:
    tc = topics["label"].value_counts().reset_index()
    tc.columns = ["topic", "events"]
    c1, c2 = st.columns(2)
    with c1:
        fig = px.bar(tc.head(12).sort_values("events"), x="events", y="topic", orientation="h")
        chart(fig, f"Most-covered topics (event mentions). {len(topics):,} topic "
                   f"selections across {ev['event_id'].nunique():,} events.", key="cur_top")
    with c2:
        fig = px.bar(tc.tail(12).sort_values("events", ascending=False),
                     x="events", y="topic", orientation="h", color_discrete_sequence=["#C0504D"])
        chart(fig, "Least-covered topics — candidates for curriculum reinforcement.", key="cur_bottom")

    # Per-project topic focus
    section("Topic focus by project")
    proj_pick = st.selectbox("Project", ["(all)"] + sorted(topics["project_label"].dropna().unique().tolist()),
                             key="cur_proj")
    tp = topics if proj_pick == "(all)" else topics[topics["project_label"] == proj_pick]
    tt = tp["label"].value_counts().head(15).reset_index()
    tt.columns = ["topic", "events"]
    fig = px.bar(tt.sort_values("events"), x="events", y="topic", orientation="h")
    chart(fig, f"Top topics for {proj_pick}.", key="cur_projtop")
else:
    st.info("No topic data in the current selection.")

# Curriculum coverage-vs-defined gap
section("Curriculum coverage vs defined topic list")
decoder = get_decoder()
defined = decoder.lists.get(decoder.field_to_list.get("training_topic", ""), {})
if defined and topics is not None:
    covered = set(topics["code"].unique())
    rows = [{"topic": lbl, "covered": code in covered,
             "events": int((topics["code"] == code).sum())}
            for code, lbl in defined.items()]
    gap = pd.DataFrame(rows).sort_values("events")
    fig = px.bar(gap, x="events", y="topic", orientation="h",
                 color="covered", color_discrete_map={True: "#2E8B57", False: "#C0504D"})
    chart(fig, f"Every topic in the defined curriculum ({len(defined)} topics) vs "
               f"how often it was covered. Red bars at zero = defined but never "
               f"delivered in this selection.", height=max(300, 22*len(gap)), key="cur_gap")
else:
    st.caption("Curriculum-gap chart needs the authoritative `training_topic` "
               "choice list. It appears once `tools/refresh_choices.py` has "
               "loaded the form's choices sheet (currently provisional).")

# Manual / tool usage
section("Training manual / tool usage")
c1, c2 = st.columns(2)
with c1:
    used = ev["is_training_manual_used_label"].replace("", "Unspecified").value_counts().reset_index()
    used.columns = ["used", "events"]
    fig = px.pie(used, names="used", values="events", hole=0.5)
    chart(fig, "Share of events using a structured manual/guide/tool.", key="cur_manualuse")
with c2:
    mn = ev[ev["manual_name_label"].fillna("") != ""]["manual_name_label"].value_counts().head(12).reset_index()
    mn.columns = ["manual", "events"]
    if not mn.empty:
        fig = px.bar(mn.sort_values("events"), x="events", y="manual", orientation="h")
        chart(fig, "Most-used named manuals/tools.", key="cur_manualname")
    else:
        st.caption("No named manuals in the current selection.")

# Carbon Farming Academy module tracker
section("Carbon Farming Academy — module completion")
if modules is not None and not modules.empty:
    mc = modules["label"].value_counts().reset_index()
    mc.columns = ["module", "events"]
    fig = px.bar(mc.sort_values("events"), x="events", y="module", orientation="h",
                 color_discrete_sequence=["#2E8B57"])
    chart(fig, f"Coverage of manual modules/chapters/themes across events. "
               f"{modules['event_id'].nunique():,} events recorded module detail.", key="cur_modules")
else:
    st.caption("No module-level (training_modules) data in the current selection — "
               "this is only captured when a structured manual is used.")

# Free-text "other" topics word frequency
section("Free-text ‘other’ topics — word frequency")
other = ev.get("training_topic_other")
if other is not None and other.fillna("").str.strip().ne("").any():
    STOP = set("the a an of and or to in for on with is are training topic other "
               "session farmers farmer".split())
    words = Counter()
    for txt in other.dropna():
        for w in re.findall(r"[a-zA-Z]{3,}", str(txt).lower()):
            if w not in STOP:
                words[w] += 1
    wf = pd.DataFrame(words.most_common(25), columns=["word", "count"])
    if not wf.empty:
        fig = px.bar(wf.sort_values("count"), x="count", y="word", orientation="h")
        chart(fig, "Most frequent words in free-text 'other topic' entries — surfaces "
                   "emerging themes not in the fixed list.", height=max(300, 20*len(wf)), key="cur_wf")
else:
    st.caption("No free-text 'other topic' entries in the current selection.")

with st.expander("⬇️ Export topic frequency"):
    if topics is not None and not topics.empty:
        download_buttons(topics["label"].value_counts().reset_index().rename(
            columns={"index": "topic", "label": "topic", "count": "events"}),
            "eca_topics", fd.pii_unlocked, key="cur")
