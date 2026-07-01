"""Shared UI helpers: page header, KPI cards, captioned charts, theming."""
from __future__ import annotations

import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# Solidaridad-ish palette.
PRIMARY = "#1F4E79"
ACCENT = "#2E8B57"
SEQ = ["#1F4E79", "#2E8B57", "#E1A100", "#C0504D", "#7F7F7F", "#4BACC6", "#9BBB59"]
GENDER_COLORS = {"Female": "#C0504D", "Male": "#1F4E79", "Other": "#7F7F7F"}


def configure_page(title: str, icon: str = "📊"):
    st.set_page_config(page_title=f"ECA Events — {title}", page_icon=icon,
                       layout="wide", initial_sidebar_state="expanded")


def style_fig(fig: go.Figure, height: int | None = None) -> go.Figure:
    fig.update_layout(
        template="plotly_white",
        margin=dict(l=10, r=10, t=40, b=10),
        colorway=SEQ,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        font=dict(size=13),
    )
    if height:
        fig.update_layout(height=height)
    return fig


def page_header(title: str, subtitle: str, fd) -> None:
    st.title(title)
    if subtitle:
        st.caption(subtitle)
    meta = fd.meta
    refreshed = meta.get("refreshed_at") or "— (bundled sample data)"
    src = meta.get("source", "?")
    cols = st.columns([2, 2, 2, 3])
    cols[0].metric("Events (filtered)", f"{fd.n_events:,}")
    cols[1].metric("Total reach", f"{fd.total_reach:,}",
                   help="Aggregate headcount = Σ total_participants. NOT the "
                        "individual demographic sample size.")
    cols[2].metric("Individually recorded (n)", f"{fd.individual_sample_n:,}",
                   help="Participants captured individually via the participant "
                        "repeat. Demographic charts drawn from this are labelled "
                        "with this n.")
    cols[3].markdown(
        f"**Last data refresh:** {refreshed}  \n"
        f"**Source:** `{src}`" + ("  ·  🧪 *test records included*" if fd.include_test else ""))
    if meta.get("choices_provisional"):
        st.warning(
            "⚠️ **Provisional decode map.** Labels for coded values are a "
            "best-effort bootstrap. Run `tools/refresh_choices.py` (via the "
            "KoBo MCP `get_form_content` tool) to load the authoritative "
            "code→label map from the form's choices sheet.", icon="⚠️")
    st.markdown("---")


def kpi_row(items: list[dict]):
    """items: [{'label','value','help'(opt),'delta'(opt)}]"""
    cols = st.columns(len(items))
    for c, it in zip(cols, items):
        c.metric(it["label"], it["value"], delta=it.get("delta"), help=it.get("help"))


def chart(fig: go.Figure, caption: str, height: int | None = None, key: str | None = None):
    """Render a plotly figure with a mandatory one-line caption below it."""
    st.plotly_chart(style_fig(fig, height), use_container_width=True, key=key)
    st.caption(caption)


def note(text: str):
    st.caption(text)


def no_data(msg: str = "No data for the current filter selection."):
    st.info(msg)


def section(title: str):
    st.subheader(title)
