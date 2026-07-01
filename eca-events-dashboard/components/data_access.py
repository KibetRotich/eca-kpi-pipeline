"""
Cached data access + the global filter contract shared by every page.

Pages call :func:`filtered_data` at the top of their body. It:
  1. loads the processed :class:`Dataset` once (``st.cache_data``),
  2. renders the persistent sidebar filters (state kept in ``st.session_state``),
  3. returns a :class:`FilteredData` bundle with every frame already sliced to
     the current selection (events + child tables + exploded frames).

Heavy work (ingest -> flatten -> enrich -> explode) happens once per data
refresh inside the cached loader; filtering is cheap boolean masking, so
changing a filter never re-runs the pipeline.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import pandas as pd
import streamlit as st

from config import CACHE_TTL_SECONDS, MULTISELECT_FIELDS
from data_pipeline.pipeline import Dataset, build_dataset


def _bridge_secrets_to_env() -> None:
    """Streamlit Community Cloud provides config via ``st.secrets`` but does NOT
    export it to ``os.environ``; the ingest layer reads env vars. Mirror the
    relevant keys across (env wins if already set, e.g. local dev)."""
    for key in ("KOBO_TOKEN", "KOBO_URL", "ECA_DATA_SOURCE", "ECA_CACHE_TTL"):
        if key not in os.environ:
            try:
                if key in st.secrets:
                    os.environ[key] = str(st.secrets[key])
            except Exception:
                # st.secrets raises if no secrets file exists (local dev) — fine.
                pass


def _resolve_source() -> str:
    """Data source: "auto" (cache else synthetic), "cache", "synthetic", or
    "live" (fetch from KoBo — the hosted path). Resolved after bridging secrets."""
    _bridge_secrets_to_env()
    return os.environ.get("ECA_DATA_SOURCE", "auto")


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner="Loading & processing submissions…")
def _load_dataset_cached(source: str) -> Dataset:
    return build_dataset(source)


def load_dataset() -> Dataset:
    return _load_dataset_cached(_resolve_source())


@dataclass
class FilteredData:
    events: pd.DataFrame
    participants: pd.DataFrame
    facilitators: pd.DataFrame
    selected_participants: pd.DataFrame
    multiselect: dict
    meta: dict
    include_test: bool
    pii_unlocked: bool

    @property
    def n_events(self) -> int:
        return len(self.events)

    @property
    def total_reach(self) -> int:
        """Aggregate headcount = sum of total_participants (NOT the individual
        demographic sample size)."""
        if "total_participants" in self.events:
            return int(self.events["total_participants"].fillna(0).sum())
        return 0

    @property
    def individual_sample_n(self) -> int:
        """Number of individually recorded participants (repeat rows)."""
        return len(self.participants)


def _msel(label, options, key, help=None):
    """Multiselect that persists via session_state; empty = 'all'."""
    return st.sidebar.multiselect(label, options=options, key=key, help=help)


def _apply_in(df, col, selected):
    if not selected or col not in df.columns:
        return df
    return df[df[col].isin(selected)]


def render_sidebar_and_filter(ds: Dataset) -> FilteredData:
    ev = ds.events
    st.sidebar.markdown("### 🔎 Global filters")

    # -- test toggle (default: exclude test records) --------------------------
    include_test = st.sidebar.toggle(
        "Include test records", value=False, key="flt_include_test",
        help="Off (default) = real records only. On = include records marked "
             "as test (debug).")
    base = ev if include_test else ev[ev["is_real"]]

    # -- date range -----------------------------------------------------------
    dates = base["training_date"].dropna()
    if not dates.empty:
        dmin, dmax = dates.min().date(), dates.max().date()
        dr = st.sidebar.date_input(
            "Activity date range", value=(dmin, dmax), min_value=dmin,
            max_value=dmax, key="flt_dates")
        if isinstance(dr, (list, tuple)) and len(dr) == 2:
            lo, hi = pd.Timestamp(dr[0]), pd.Timestamp(dr[1])
            base = base[(base["training_date"] >= lo) & (base["training_date"] <= hi)
                        | base["training_date"].isna()]

    # -- cascading geography: country -> admin1 -> admin2 ---------------------
    countries = sorted(base["country_label"].dropna().unique().tolist())
    sel_country = _msel("Country", countries, "flt_country")
    geo = _apply_in(base, "country_label", sel_country)

    a1_opts = sorted(geo["admin_level_1_label"].dropna().replace("", pd.NA).dropna().unique().tolist())
    sel_a1 = _msel("Admin level 1", a1_opts, "flt_a1",
                   help="County (Kenya) / Region (UG, TZ, ETH)")
    geo = _apply_in(geo, "admin_level_1_label", sel_a1)

    a2_opts = sorted(geo["admin_level_2"].dropna().replace("", pd.NA).dropna().unique().tolist())
    sel_a2 = _msel("Admin level 2", a2_opts, "flt_a2",
                   help="Sub-county / District / Zone")
    geo = _apply_in(geo, "admin_level_2", sel_a2)

    # -- project / commodity --------------------------------------------------
    proj_opts = sorted(geo["project_label"].dropna().unique().tolist())
    sel_proj = _msel("Project", proj_opts, "flt_project")
    geo = _apply_in(geo, "project_label", sel_proj)

    comm_opts = sorted(geo["project_commodity_category_label"].dropna().replace("", pd.NA).dropna().unique().tolist())
    sel_comm = _msel("Commodity group", comm_opts, "flt_commodity")
    geo = _apply_in(geo, "project_commodity_category_label", sel_comm)

    # -- event / training type ------------------------------------------------
    et_opts = sorted(geo["event_type_label"].dropna().replace("", pd.NA).dropna().unique().tolist())
    sel_et = _msel("Event type", et_opts, "flt_event_type")
    geo = _apply_in(geo, "event_type_label", sel_et)

    tt_opts = sorted(geo["training_type_label"].dropna().replace("", pd.NA).dropna().unique().tolist())
    sel_tt = _msel("Training type", tt_opts, "flt_training_type")
    geo = _apply_in(geo, "training_type_label", sel_tt)

    filtered_events = geo
    ev_ids = set(filtered_events["event_id"])

    # -- PII gate -------------------------------------------------------------
    st.sidebar.markdown("---")
    with st.sidebar.expander("🔒 Restricted detail (PII)"):
        st.caption("Row-level phone numbers, Beneficiary IDs, names and "
                   "disability status are hidden on all shared views. Unlock "
                   "only for authorised 1:1 verification.")
        pii_unlocked = st.checkbox("Unlock row-level PII (authorised users only)",
                                   value=False, key="flt_pii")

    st.sidebar.markdown("---")
    st.sidebar.caption(
        "📤 **Export:** each chart's toolbar (hover top-right) has a camera icon "
        "for PNG. Data tables export via the ⬇️ CSV/Excel buttons on each page. "
        "For a full-page PDF, use your browser's Print → Save as PDF.")

    def _child(df):
        if df is None or df.empty or "event_id" not in df.columns:
            return df.iloc[0:0] if df is not None else df
        return df[df["event_id"].isin(ev_ids)]

    multiselect = {}
    for f in MULTISELECT_FIELDS:
        m = ds.multiselect.get(f)
        multiselect[f] = _child(m) if m is not None else m

    return FilteredData(
        events=filtered_events,
        participants=_child(ds.participants),
        facilitators=_child(ds.facilitators),
        selected_participants=_child(ds.selected_participants),
        multiselect=multiselect,
        meta=ds.meta,
        include_test=include_test,
        pii_unlocked=pii_unlocked,
    )


def filtered_data() -> FilteredData:
    """Entry point every page calls first."""
    ds = load_dataset()
    return render_sidebar_and_filter(ds)
