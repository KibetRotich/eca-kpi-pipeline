"""
Solidaridad ECA — KPI ETL Pipeline
====================================
Reads the latest CSV exported from Salesforce, cleans and transforms it,
then writes the results to a Google Sheet with four tabs:

  Sheet1 "kpi_data"     — cleaned row-level KPI data (what the dashboard reads)
  Sheet2 "by_year"      — achievement + target aggregated by KPI × year
  Sheet3 "by_country"   — achievement + target aggregated by KPI × country
  Sheet4 "by_commodity" — achievement + target aggregated by KPI × commodity
  Sheet5 "meta"         — last-run timestamp and row count

Usage:
  python pipeline/etl.py

Environment variables (set locally or via GitHub Secrets):
  GOOGLE_CREDENTIALS  — path to service account JSON file
                        OR the JSON content as a string (for GitHub Actions)
  SHEET_ID            — Google Sheets document ID
                        (the long string in the sheet URL)
"""

import os
import sys
import json
import glob
import tempfile
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import gspread
from google.oauth2.service_account import Credentials

# ── CONFIG ─────────────────────────────────────────────────────────────────

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# KPI names to keep (MASP III priority set shown in the Looker dashboard)
PRIORITY_KPIS = {
    "# of farmers trained",
    "# of farmers with farm income increase",
    "# of farmers with improved yield (kg/ha))",
    "# of ha under sustainable management in a given year",
    "# targeted producers with new or improved access to markets",
    "# producers with new or improved access to services",
    "# of farmers that receive technical assistance from Solidaridad",
    "# of women in decision making positions",
    "# of members of strengthened (producer) organisations",
    "# tGHGe/year mitigated",
    "# of farmers with enhanced resilience",
    "# of direct jobs supported by targeted producers",
    "# of persons who are newly employed as a result of Solidaridad's support",
    "# of farmers with improved farm viability",
    "# of ha with improved soil organic matter",
    "# of workers under improved working conditions",
    "# of farmers that access new or improved services from service providers supported by Solidaridad",
    "# of Farmers organised in groups or cooperatives as a result of Solidaridad support",
    "# of local Service Providers supported to provide services and inputs",
    "# of women who have control over their income",
    "Volume produced under sustainable management",
    "# of ha of native vegetation conserved within the farm",
    "# of hectares under restoration and conservation",
}

# Expected column names from the Salesforce CSV export
# Maps raw CSV column → standardised internal name
COLUMN_MAP = {
    "kpi_name":                   "kpi_name",
    "indicator_id":               "indicator_id",
    "commodity":                  "commodity",
    "net_achievement":            "net_achievement",
    "net_annual_target":          "net_annual_target",
    "stakeholder_disaggregation": "stakeholder_disaggregation",
    "results_new":                "results_new",
    "results_continued":          "results_continued",
    "targets_new":                "targets_new",
    "targets_continued":          "targets_continued",
    "year":                       "year",
    "project_name":               "project_name",
    "country":                    "country",
}


# ── HELPERS ─────────────────────────────────────────────────────────────────

def find_latest_csv(data_dir: str = "data") -> str:
    """Return the most recently modified CSV in the data/ directory."""
    pattern = str(Path(data_dir) / "*.csv")
    files = glob.glob(pattern)
    if not files:
        sys.exit(
            f"ERROR: No CSV files found in '{data_dir}/'. "
            "Export from Salesforce and place the file there."
        )
    latest = max(files, key=os.path.getmtime)
    print(f"  Using CSV: {latest}")
    return latest


def load_credentials() -> Credentials:
    """Load Google service account credentials from env var or file."""
    raw = os.environ.get("GOOGLE_CREDENTIALS", "")
    if not raw:
        sys.exit(
            "ERROR: GOOGLE_CREDENTIALS environment variable is not set.\n"
            "Set it to the path of your service account JSON file, or to the "
            "JSON content directly (for GitHub Actions).\n"
            "See pipeline/SETUP.md for instructions."
        )

    # If it looks like a file path, read the file
    if os.path.isfile(raw):
        with open(raw) as f:
            info = json.load(f)
    else:
        # Treat as raw JSON string (GitHub Actions secret)
        try:
            info = json.loads(raw)
        except json.JSONDecodeError:
            sys.exit("ERROR: GOOGLE_CREDENTIALS is not valid JSON and is not a file path.")

    return Credentials.from_service_account_info(info, scopes=SCOPES)


def to_float(series: pd.Series) -> pd.Series:
    """Coerce a column to float, replacing blanks/errors with 0."""
    return pd.to_numeric(series.astype(str).str.replace(",", ""), errors="coerce").fillna(0)


# ── EXTRACT ─────────────────────────────────────────────────────────────────

def extract(csv_path: str) -> pd.DataFrame:
    print("\n[1/4] EXTRACT — reading CSV …")
    df = pd.read_csv(csv_path, dtype=str, encoding="utf-8-sig")
    # Strip whitespace from column names
    df.columns = [c.strip().replace("\ufeff", "") for c in df.columns]
    print(f"       {len(df):,} rows, {len(df.columns)} columns")
    return df


# ── TRANSFORM ───────────────────────────────────────────────────────────────

def transform(df: pd.DataFrame) -> pd.DataFrame:
    print("\n[2/4] TRANSFORM …")

    # Rename to standard names (case-insensitive match)
    col_lower = {c.lower().strip(): c for c in df.columns}
    rename = {}
    for target, standard in COLUMN_MAP.items():
        match = col_lower.get(target.lower())
        if match:
            rename[match] = standard
    df = df.rename(columns=rename)

    # Keep only columns we care about (ignore extras from Salesforce)
    available = [c for c in COLUMN_MAP.values() if c in df.columns]
    df = df[available].copy()

    # Clean string columns
    for col in ["kpi_name", "commodity", "project_name", "country",
                "stakeholder_disaggregation", "indicator_id"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
            df[col] = df[col].replace({"nan": "", "None": "", "NaN": ""})

    # Drop rows with no KPI name
    df = df[df["kpi_name"].str.len() > 0].copy()

    # Filter to priority KPIs only
    before = len(df)
    df = df[df["kpi_name"].isin(PRIORITY_KPIS)].copy()
    print(f"       Filtered to priority KPIs: {before:,} → {len(df):,} rows")

    # Numeric columns
    num_cols = ["net_achievement", "net_annual_target",
                "results_new", "results_continued",
                "targets_new", "targets_continued"]
    for col in num_cols:
        if col in df.columns:
            df[col] = to_float(df[col])

    # Year as integer string for consistent sorting
    if "year" in df.columns:
        df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0).astype(int).astype(str)
        df = df[df["year"] != "0"]  # drop rows with no year

    # Sort
    df = df.sort_values(
        ["kpi_name", "country", "project_name", "year"],
        na_position="last"
    ).reset_index(drop=True)

    print(f"       Final rows: {len(df):,}")
    return df


# ── AGGREGATE ───────────────────────────────────────────────────────────────

def aggregate(df: pd.DataFrame) -> dict:
    print("\n[3/4] AGGREGATE …")
    num = ["net_achievement", "net_annual_target", "results_new", "results_continued"]
    num_present = [c for c in num if c in df.columns]

    def agg(group_cols):
        return (
            df.groupby(group_cols, dropna=False)[num_present]
            .sum()
            .reset_index()
            .sort_values(group_cols)
        )

    by_year      = agg(["kpi_name", "year"])
    by_country   = agg(["kpi_name", "country"])
    by_commodity = agg(["kpi_name", "commodity"])

    print(f"       by_year: {len(by_year):,} rows")
    print(f"       by_country: {len(by_country):,} rows")
    print(f"       by_commodity: {len(by_commodity):,} rows")

    return {
        "by_year":      by_year,
        "by_country":   by_country,
        "by_commodity": by_commodity,
    }


# ── LOAD ────────────────────────────────────────────────────────────────────

def df_to_sheet(ws, df: pd.DataFrame):
    """Clear a worksheet and write a DataFrame to it (header + rows)."""
    ws.clear()
    # Convert all values to strings for gspread
    rows = [df.columns.tolist()] + df.astype(str).values.tolist()
    ws.update(rows, value_input_option="RAW")


def load(df_main: pd.DataFrame, aggs: dict, sheet_id: str, creds: Credentials):
    print("\n[4/4] LOAD → Google Sheets …")
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(sheet_id)

    def get_or_create(name):
        try:
            return sh.worksheet(name)
        except gspread.WorksheetNotFound:
            return sh.add_worksheet(title=name, rows=5000, cols=20)

    # Tab 1 — raw KPI data (what the dashboard reads)
    print("       Writing kpi_data …")
    ws_kpi = get_or_create("kpi_data")
    df_to_sheet(ws_kpi, df_main)

    # Tab 2-4 — aggregations
    for name, df_agg in aggs.items():
        print(f"       Writing {name} …")
        ws = get_or_create(name)
        df_to_sheet(ws, df_agg)

    # Tab 5 — metadata
    ws_meta = get_or_create("meta")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    ws_meta.clear()
    ws_meta.update([
        ["last_updated", now],
        ["kpi_rows",     str(len(df_main))],
        ["source_file",  "Salesforce CSV export"],
        ["pipeline",     "github-actions/etl.py"],
    ])

    # Make the sheet readable by the dashboard (share read-only with anyone)
    try:
        sh.share(None, perm_type="anyone", role="reader", notify=False)
        print("       Sheet visibility: Anyone with link can view ✓")
    except Exception as e:
        print(f"       Note: Could not set sheet sharing ({e}). "
              "Please manually share the sheet as 'Anyone with link can view'.")

    sheet_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    print(f"\n  ✓  Google Sheet updated: {sheet_url}")
    return sheet_url


# ── MAIN ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Solidaridad ECA — KPI ETL Pipeline")
    print("=" * 60)

    sheet_id = os.environ.get("SHEET_ID", "").strip()
    if not sheet_id:
        sys.exit(
            "ERROR: SHEET_ID environment variable is not set.\n"
            "Set it to your Google Sheets document ID.\n"
            "See pipeline/SETUP.md for instructions."
        )

    csv_path = find_latest_csv("data")
    creds    = load_credentials()

    df       = extract(csv_path)
    df_clean = transform(df)
    aggs     = aggregate(df_clean)
    load(df_clean, aggs, sheet_id, creds)

    print("\n  Pipeline complete.\n")


if __name__ == "__main__":
    main()
