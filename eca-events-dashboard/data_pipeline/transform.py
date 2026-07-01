"""
Transform flattened tables into analysis-ready frames.

Responsibilities
----------------
* Decode coded fields to human-readable labels (``*_label`` columns).
* Resolve country-conditional admin-level titles.
* Compute derived event fields: %female, %youth, capture rate, completeness,
  is_test flag, month period.
* Explode multi-select fields (``beneficiary_type``/``training_topic``/
  ``training_modules``) into long format.
* Parse the ``selected_participants`` known-farmer list ("id__code" tokens).
* Deduplicate farmers by ``farmer_id`` where present; flag name-only records as
  "unverified identity".

Raw code columns are always preserved; label columns are added alongside.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from config import (
    ADMIN_LEVELS,
    DEFAULT_ADMIN_LEVELS,
    MULTISELECT_FIELDS,
    REAL_TEST_FIELD,
    REAL_TEST_MISSING_IS_REAL,
    YOUTH_MAX_AGE,
)
from data_pipeline.decode import Decoder, get_decoder

# Event-level integer headcount fields.
_NUMERIC_EVENT_FIELDS = [
    "total_participants",
    "female_participants",
    "male_youth_participants",
    "female_youth_participants",
    "youth_participants",
]

# Coded event fields we always add a ``*_label`` column for.
_CODED_EVENT_FIELDS = [
    "real_test",
    "event_type",
    "training_type",
    "country",
    "project",
    "project_commodity_category",
    "project_commodity_specific",
    "is_training_manual_used",
    "manual_name",
]


def _to_num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _split_codes(value) -> list[str]:
    """Space-delimited multi-select string -> list of codes."""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return []
    s = str(value).strip()
    return s.split() if s else []


# ── Event transforms ──────────────────────────────────────────────────────────

def enrich_events(events: pd.DataFrame, decoder: Decoder | None = None) -> pd.DataFrame:
    decoder = decoder or get_decoder()
    df = events.copy()

    # Ensure every expected column exists (version drift tolerance).
    for col in _NUMERIC_EVENT_FIELDS + _CODED_EVENT_FIELDS + [
        "admin_level_1", "admin_level_2", "admin_level_3",
        "admin_level_1_title", "admin_level_2_title", "admin_level_3_title",
        "training_date", "next_training_date", "selected_participants",
        "organization_name", "training_title", "enumarator_names",
    ]:
        if col not in df.columns:
            df[col] = pd.NA

    # -- numeric headcounts ----------------------------------------------------
    for col in _NUMERIC_EVENT_FIELDS:
        df[col] = _to_num(df[col])

    # youth_participants may be a form calc; backfill from components if missing.
    comp_youth = df["male_youth_participants"].fillna(0) + df["female_youth_participants"].fillna(0)
    df["youth_participants"] = df["youth_participants"].where(df["youth_participants"].notna(), comp_youth)

    # -- test / real -----------------------------------------------------------
    rt = df[REAL_TEST_FIELD].astype("string").str.strip().str.lower()
    if REAL_TEST_MISSING_IS_REAL:
        df["is_test"] = rt.eq("test").fillna(False)
    else:
        df["is_test"] = ~rt.eq("real").fillna(False)
    df["is_real"] = ~df["is_test"]

    # -- decode coded fields ---------------------------------------------------
    for field in _CODED_EVENT_FIELDS:
        df[f"{field}_label"] = df[field].map(lambda c, f=field: decoder.label(f, c))

    # -- dates -----------------------------------------------------------------
    df["training_date"] = pd.to_datetime(df["training_date"], errors="coerce")
    df["next_training_date"] = pd.to_datetime(df["next_training_date"], errors="coerce")
    df["submission_time"] = pd.to_datetime(df.get("_submission_time"), errors="coerce", utc=True)
    df["month"] = df["training_date"].dt.to_period("M").astype("string")
    df["year"] = df["training_date"].dt.year
    # Timeliness: days between activity and submission (data-entry lag).
    st = df["submission_time"].dt.tz_localize(None)
    df["submission_lag_days"] = (st - df["training_date"]).dt.days

    # -- admin-level titles (country-conditional) ------------------------------
    def _title(row, level):
        calc = row.get(f"admin_level_{level}_title")
        if isinstance(calc, str) and calc.strip():
            return calc.strip().title()
        country = row.get("country")
        country = country.strip().lower() if isinstance(country, str) else ""
        return ADMIN_LEVELS.get(country, DEFAULT_ADMIN_LEVELS)[str(level)]

    df["admin_level_1_title_resolved"] = df.apply(lambda r: _title(r, 1), axis=1)
    df["admin_level_2_title_resolved"] = df.apply(lambda r: _title(r, 2), axis=1)
    df["admin_level_3_title_resolved"] = df.apply(lambda r: _title(r, 3), axis=1)
    # Admin values themselves are mostly free-text labels already; humanise codes.
    for lvl in (1, 2, 3):
        col = f"admin_level_{lvl}"
        df[f"{col}_label"] = df[col].map(lambda c, f=col: decoder.label(f, c) if pd.notna(c) else "")

    # -- selected known-farmer list -------------------------------------------
    df["_selected_tokens"] = df["selected_participants"].map(_split_codes)
    df["n_selected_participants"] = df["_selected_tokens"].map(len)

    # -- derived reach metrics -------------------------------------------------
    tp = df["total_participants"]
    df["pct_female"] = np.where(tp > 0, df["female_participants"] / tp * 100, np.nan)
    df["pct_youth"] = np.where(tp > 0, df["youth_participants"] / tp * 100, np.nan)
    # Individual records captured = repeat participants + known-farmer selections.
    df["n_individual_records"] = df["n_participants_recorded"].fillna(0) + df["n_selected_participants"].fillna(0)
    df["individual_capture_rate"] = np.where(
        tp > 0, (df["n_individual_records"] / tp * 100).clip(upper=100), np.nan
    )

    # -- completeness score ----------------------------------------------------
    signals = pd.DataFrame({
        "gps": df["has_gps"].astype(float),
        "photo": df["has_photo"].astype(float),
        "sheet": df["has_attendance_sheet"].astype(float),
        "admin2": df["admin_level_2"].apply(lambda v: 1.0 if (isinstance(v, str) and v.strip()) else 0.0),
    })
    df["completeness_score"] = signals.mean(axis=1) * 100
    df["missing_gps"] = ~df["has_gps"]
    df["missing_photo"] = ~df["has_photo"]
    df["missing_sheet"] = ~df["has_attendance_sheet"]
    df["missing_admin2"] = signals["admin2"].eq(0.0)

    return df


# ── Multi-select explosion ────────────────────────────────────────────────────

def explode_multiselect(events: pd.DataFrame, field: str, decoder: Decoder | None = None) -> pd.DataFrame:
    """Long frame: one row per (event, code) for a multi-select field.

    Carries a few event dimensions for convenient grouping downstream.
    """
    decoder = decoder or get_decoder()
    if field not in events.columns:
        return pd.DataFrame(columns=["event_id", "code", "label", field])
    carry = [c for c in ["event_id", "country", "country_label", "project",
                         "project_label", "is_real", "is_test", "training_date",
                         "month", "year"] if c in events.columns]
    rows = []
    for _, r in events[carry + [field]].iterrows():
        for code in _split_codes(r[field]):
            row = {c: r[c] for c in carry}
            row["code"] = code
            row["label"] = decoder.label(field, code)
            rows.append(row)
    out = pd.DataFrame(rows)
    if out.empty:
        out = pd.DataFrame(columns=carry + ["code", "label"])
    return out


def explode_selected_participants(events: pd.DataFrame) -> pd.DataFrame:
    """Long frame of known-farmer selections: internal_id + beneficiary_code."""
    carry = [c for c in ["event_id", "country_label", "project_label",
                         "is_real", "training_date"] if c in events.columns]
    rows = []
    for _, r in events.iterrows():
        for tok in (r.get("_selected_tokens") or []):
            internal_id, _, code = str(tok).partition("__")
            row = {c: r[c] for c in carry}
            row["internal_id"] = internal_id
            row["beneficiary_code"] = code or internal_id
            rows.append(row)
    return pd.DataFrame(rows) if rows else pd.DataFrame(columns=carry + ["internal_id", "beneficiary_code"])


# ── Participant transforms + farmer dedup ──────────────────────────────────────

def enrich_participants(participants: pd.DataFrame, events: pd.DataFrame,
                        decoder: Decoder | None = None) -> pd.DataFrame:
    """Decode participant demographics and attach event context.

    Adds:
      - gender_label / age_group_label / disability_label
      - is_youth (from age_group or year_of_birth)
      - identity_status: 'verified' (has farmer_id) vs 'unverified' (name only)
      - farmer_key: dedup key (farmer_id if present else normalised name)
    """
    decoder = decoder or get_decoder()
    if participants is None or participants.empty:
        return pd.DataFrame(columns=[
            "event_id", "gender", "gender_label", "age_group", "age_group_label",
            "is_youth", "identity_status", "farmer_key",
        ])
    df = participants.copy()
    for col in ["gender", "age_group", "disability", "has_farmer_id", "farmer_id",
                "first_name", "last_name", "year_of_birth", "phone_number"]:
        if col not in df.columns:
            df[col] = pd.NA

    df["gender_label"] = df["gender"].map(lambda c: decoder.label("gender", c))
    df["age_group_label"] = df["age_group"].map(lambda c: decoder.label("age_group", c))
    df["disability_label"] = df["disability"].map(lambda c: decoder.label("disability", c))

    # Youth: prefer explicit age_group; else derive from year_of_birth vs event year.
    yob = _to_num(df["year_of_birth"])
    ev_year = events.set_index("event_id")["year"] if "year" in events.columns else None
    if ev_year is not None:
        df = df.merge(ev_year.rename("event_year"), left_on="event_id", right_index=True, how="left")
    else:
        df["event_year"] = np.nan
    derived_age = df["event_year"] - yob
    # Conditions come from nullable dtypes (StringDtype .eq / nullable subtraction),
    # so they can contain <NA>, which np.where cannot evaluate. Collapse NA->False
    # and hand np.where plain numpy boolean arrays.
    age_lc = df["age_group"].astype("string").str.lower()
    is_below = age_lc.eq("below_35").fillna(False).to_numpy(dtype=bool)
    is_above = age_lc.eq("above_35").fillna(False).to_numpy(dtype=bool)
    derived_youth = derived_age.le(YOUTH_MAX_AGE).fillna(False).to_numpy(dtype=bool)
    df["is_youth"] = np.where(is_below, True,
                              np.where(is_above, False, derived_youth))

    # Identity verification + dedup key.
    fid = df["farmer_id"].astype("string").str.strip()
    has_id = fid.notna() & fid.ne("") & fid.str.lower().ne("nan")
    df["identity_status"] = np.where(has_id, "verified", "unverified")
    name_key = (
        df["first_name"].astype("string").str.strip().str.lower().fillna("")
        + "|" + df["last_name"].astype("string").str.strip().str.lower().fillna("")
        + "|" + df["phone_number"].astype("string").str.strip().fillna("")
    )
    df["farmer_key"] = np.where(has_id, "id:" + fid, "name:" + name_key)

    # Attach a little event context for cross-tabs (country/project/date).
    ctx_cols = [c for c in ["country_label", "project_label", "event_type_label",
                            "training_date", "month", "year"] if c in events.columns]
    if ctx_cols:
        df = df.merge(events.set_index("event_id")[ctx_cols], left_on="event_id",
                     right_index=True, how="left")
    return df


def enrich_facilitators(facilitators: pd.DataFrame, events: pd.DataFrame,
                       decoder: Decoder | None = None) -> pd.DataFrame:
    decoder = decoder or get_decoder()
    if facilitators is None or facilitators.empty:
        return pd.DataFrame(columns=["event_id", "facilitator_type", "facilitator_type_label"])
    df = facilitators.copy()
    for col in ["facilitator_type", "facilitator_names", "organization"]:
        if col not in df.columns:
            df[col] = pd.NA
    df["facilitator_type_label"] = df["facilitator_type"].map(lambda c: decoder.label("facilitator_type", c))
    ctx_cols = [c for c in ["country_label", "project_label", "training_date",
                            "month", "year", "is_real"] if c in events.columns]
    if ctx_cols:
        df = df.merge(events.set_index("event_id")[ctx_cols], left_on="event_id",
                     right_index=True, how="left")
    return df
