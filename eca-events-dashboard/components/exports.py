"""
Export helpers + PII protection.

PII rules (enforced here so no page can accidentally leak):
  * phone numbers, Beneficiary IDs and national IDs are masked;
  * participant names and facilitator/enumerator names are dropped;
  * disability is aggregate-only.
Unless ``pii_unlocked`` is True (the sidebar's authorised-user gate), these
columns are removed/masked from any dataframe shown or exported.
"""
from __future__ import annotations

import io

import pandas as pd
import streamlit as st

from config import PII_FIELDS, SENSITIVE_AGGREGATE_ONLY

_MASK_COLS = {"phone_number", "farmer_id", "national_identity"}
_DROP_COLS = {"first_name", "last_name", "facilitator_names"}
# Internal working columns that are noise in a shared export.
_INTERNAL_COLS = {"_selected_tokens"}


def _mask_value(v):
    if v is None or (isinstance(v, float)):
        return v
    s = str(v)
    if len(s) <= 4:
        return "•" * len(s)
    return s[:2] + "•" * (len(s) - 4) + s[-2:]


def safe_display_df(df: pd.DataFrame, pii_unlocked: bool = False,
                    drop_disability: bool = True) -> pd.DataFrame:
    """Return a copy safe for shared display/export."""
    if df is None or df.empty:
        return df
    out = df.copy()
    # Always strip internal working columns (list-typed / not analytically useful).
    out = out.drop(columns=[c for c in out.columns if c in _INTERNAL_COLS], errors="ignore")
    if pii_unlocked:
        return out
    for col in list(out.columns):
        base = col.split("__")[-1]
        if base in _MASK_COLS:
            out[col] = out[col].map(_mask_value)
        elif base in _DROP_COLS:
            out = out.drop(columns=[col])
        elif base in SENSITIVE_AGGREGATE_ONLY and drop_disability:
            out = out.drop(columns=[col])
    return out


def _excel_safe(df: pd.DataFrame) -> pd.DataFrame:
    """Excel can't store tz-aware datetimes; make any such column tz-naive."""
    out = df.copy()
    for col in out.columns:
        s = out[col]
        if isinstance(s.dtype, pd.DatetimeTZDtype):
            out[col] = s.dt.tz_localize(None)
    return out


def _to_excel_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="xlsxwriter") as xw:
        _excel_safe(df).to_excel(xw, index=False, sheet_name="data")
    return buf.getvalue()


def download_buttons(df: pd.DataFrame, basename: str, pii_unlocked: bool = False,
                     key: str | None = None):
    """CSV + Excel download of the (PII-safe) dataframe."""
    if df is None or df.empty:
        st.caption("Nothing to export for the current selection.")
        return
    safe = safe_display_df(df, pii_unlocked)
    c1, c2 = st.columns(2)
    c1.download_button(
        "⬇️ CSV", safe.to_csv(index=False).encode("utf-8-sig"),
        file_name=f"{basename}.csv", mime="text/csv", key=f"csv_{key or basename}")
    c2.download_button(
        "⬇️ Excel", _to_excel_bytes(safe),
        file_name=f"{basename}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        key=f"xlsx_{key or basename}")


def fig_png_button(fig, basename: str, key: str | None = None):
    """Offer a PNG download of a plotly figure (needs kaleido)."""
    try:
        png = fig.to_image(format="png", scale=2)
    except Exception:
        st.caption("📷 PNG export needs the `kaleido` package "
                   "(`pip install kaleido`). Use the chart's camera menu instead.")
        return
    st.download_button("⬇️ PNG", png, file_name=f"{basename}.png",
                       mime="image/png", key=f"png_{key or basename}")
