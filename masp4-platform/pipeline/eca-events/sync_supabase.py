"""
Sync the ECA Trainings & Events data into Supabase.

Flow:  ingest (MCP cache / REST / synthetic) -> build_dataset (flatten, decode,
explode, dedup, derive) -> upsert into the eca_* tables defined in
supabase/migrations/0001_eca_events.sql.

Idempotent: submissions are upserted on `submission_id` (new/changed rows only);
child tables (participants, facilitators, exploded multi-selects, selected
participants) are fully rebuilt each run since they have no stable per-row key.
Because every run re-fetches the full set (~7k rows, cheap), re-running always
converges to the same state.

Data source (--source / ECA_DATA_SOURCE):
  live       fetch fresh from Kobo via REST (needs KOBO_TOKEN) — the headless /
             GitHub-Action path. (A Kobo MCP server only exists inside an
             interactive Claude Code session, so cron cannot use it; for an
             MCP-driven load, refresh the local cache first then use --source cache.)
  cache      read pipeline/eca-events/data_pipeline/cache/raw_submissions.json
  synthetic  bundled sample (offline dev / CI)
  auto       cache if present else synthetic (default)

Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

# Run with cwd = this directory so `from config import ...` /
# `from data_pipeline...` resolve exactly as in the validated pipeline.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_pipeline.pipeline import build_dataset  # noqa: E402

CHUNK = 500
CHILD_TABLES = [
    "eca_participants", "eca_facilitators", "eca_beneficiary_types",
    "eca_training_topics", "eca_training_modules", "eca_selected_participants",
]


# ── value sanitising ──────────────────────────────────────────────────────────

def _clean(v):
    """Make a single cell JSON-serialisable for the Supabase client."""
    if v is None:
        return None
    # Catches NaN, NaT and pandas <NA> (scalar). Guarded because pd.isna on a
    # list/array raises ValueError.
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    # numpy scalar -> python scalar
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return v


def _date(v):
    """Normalise a datetime-ish value to 'YYYY-MM-DD' (or None)."""
    if v is None or v is pd.NaT:
        return None
    ts = pd.to_datetime(v, errors="coerce")
    return None if pd.isna(ts) else ts.date().isoformat()


def _records(df: pd.DataFrame, colmap: dict[str, str], date_cols=()):
    """DataFrame -> list[dict] using {table_col: df_col}, sanitised."""
    if df is None or df.empty:
        return []
    out = []
    for _, r in df.iterrows():
        row = {}
        for tcol, dcol in colmap.items():
            val = r[dcol] if dcol in df.columns else None
            row[tcol] = _date(val) if tcol in date_cols else _clean(val)
        out.append(row)
    return out


# ── column maps (table_col -> dataframe_col) ────────────────────────────────────

EVENT_MAP = {
    "submission_id": "event_id", "submission_uuid": "_uuid", "form_version": "__version__",
    "training_date": "training_date", "next_training_date": "next_training_date",
    "submission_time": "submission_time", "submission_lag_days": "submission_lag_days",
    "month": "month", "year": "year",
    "country": "country", "country_label": "country_label",
    "admin_level_1": "admin_level_1", "admin_level_1_label": "admin_level_1_label",
    "admin_level_1_title": "admin_level_1_title_resolved",
    "admin_level_2": "admin_level_2", "admin_level_2_label": "admin_level_2_label",
    "admin_level_2_title": "admin_level_2_title_resolved",
    "admin_level_3": "admin_level_3", "admin_level_3_label": "admin_level_3_label",
    "admin_level_3_title": "admin_level_3_title_resolved",
    "training_location": "training_location",
    "lat": "lat", "lon": "lon", "altitude": "altitude", "gps_accuracy": "gps_accuracy",
    "project": "project", "project_label": "project_label",
    "project_commodity_category": "project_commodity_category",
    "project_commodity_category_label": "project_commodity_category_label",
    "project_commodity_specific": "project_commodity_specific",
    "project_commodity_specific_label": "project_commodity_specific_label",
    "is_organization_activity": "is_organization_activity",
    "organization_name": "organization_name",
    "training_title": "training_title", "training_topic_raw": "training_topic",
    "event_type": "event_type", "event_type_label": "event_type_label",
    "training_type": "training_type", "training_type_label": "training_type_label",
    "is_training_manual_used": "is_training_manual_used",
    "is_training_manual_used_label": "is_training_manual_used_label",
    "manual_name": "manual_name",
    "total_participants": "total_participants", "female_participants": "female_participants",
    "male_youth_participants": "male_youth_participants",
    "female_youth_participants": "female_youth_participants",
    "youth_participants": "youth_participants",
    "pct_female": "pct_female", "pct_youth": "pct_youth",
    "n_participants_recorded": "n_participants_recorded",
    "n_selected_participants": "n_selected_participants",
    "n_individual_records": "n_individual_records",
    "individual_capture_rate": "individual_capture_rate",
    "n_facilitators": "n_facilitators", "n_photos": "n_photos", "n_sheet_pages": "n_sheet_pages",
    "has_gps": "has_gps", "has_photo": "has_photo", "has_attendance_sheet": "has_attendance_sheet",
    "completeness_score": "completeness_score",
    "missing_gps": "missing_gps", "missing_photo": "missing_photo",
    "missing_sheet": "missing_sheet", "missing_admin2": "missing_admin2",
    "real_test": "real_test", "is_test": "is_test", "is_real": "is_real",
    "enumarator_names": "enumarator_names",
}
EVENT_DATES = {"training_date", "next_training_date"}

PARTICIPANT_MAP = {
    "submission_id": "event_id", "participant_index": "participant_index",
    "gender": "gender", "gender_label": "gender_label",
    "age_group": "age_group", "age_group_label": "age_group_label",
    "disability": "disability", "disability_label": "disability_label",
    "is_youth": "is_youth", "identity_status": "identity_status", "farmer_key": "farmer_key",
    "has_farmer_id": "has_farmer_id", "farmer_id": "farmer_id",
    "first_name": "first_name", "last_name": "last_name",
    "phone_number": "phone_number", "year_of_birth": "year_of_birth",
    "country_label": "country_label", "project_label": "project_label",
    "event_type_label": "event_type_label",
    "training_date": "training_date", "month": "month", "year": "year",
}
FACILITATOR_MAP = {
    "submission_id": "event_id", "facilitator_index": "facilitator_index",
    "facilitator_type": "facilitator_type", "facilitator_type_label": "facilitator_type_label",
    "facilitator_names": "facilitator_names", "organization": "organization",
    "country_label": "country_label", "project_label": "project_label",
    "training_date": "training_date", "month": "month", "year": "year", "is_real": "is_real",
}
MULTISELECT_MAP = {
    "submission_id": "event_id", "code": "code", "label": "label",
    "country_label": "country_label", "project_label": "project_label",
    "is_real": "is_real", "is_test": "is_test",
    "training_date": "training_date", "month": "month", "year": "year",
}
SELECTED_MAP = {
    "submission_id": "event_id", "internal_id": "internal_id",
    "beneficiary_code": "beneficiary_code", "country_label": "country_label",
    "project_label": "project_label", "is_real": "is_real", "training_date": "training_date",
}


# ── Supabase I/O ────────────────────────────────────────────────────────────────

def _client():
    from supabase import create_client
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and "
                         "SUPABASE_SERVICE_ROLE_KEY.")
    return create_client(url, key)


def _chunks(rows, n=CHUNK):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


def _upsert(sb, table, rows, on_conflict=None):
    for c in _chunks(rows):
        q = sb.table(table).upsert(c, on_conflict=on_conflict) if on_conflict \
            else sb.table(table).insert(c)
        q.execute()
    print(f"  {table}: {len(rows):,} rows", flush=True)


def _clear(sb, table):
    # Delete all rows (bigserial id >= 0 matches everything).
    sb.table(table).delete().gte("id", 0).execute()


def sync(source: str, dry_run: bool = False) -> dict:
    print(f"Building dataset (source={source}) …", flush=True)
    ds = build_dataset(source)
    events = ds.events

    payload = {
        "eca_submissions": _records(events, EVENT_MAP, EVENT_DATES),
        "eca_participants": _records(ds.participants, PARTICIPANT_MAP, {"training_date"}),
        "eca_facilitators": _records(ds.facilitators, FACILITATOR_MAP, {"training_date"}),
        "eca_beneficiary_types": _records(ds.multiselect.get("beneficiary_type"), MULTISELECT_MAP, {"training_date"}),
        "eca_training_topics": _records(ds.multiselect.get("training_topic"), MULTISELECT_MAP, {"training_date"}),
        "eca_training_modules": _records(ds.multiselect.get("training_modules"), MULTISELECT_MAP, {"training_date"}),
        "eca_selected_participants": _records(ds.selected_participants, SELECTED_MAP, {"training_date"}),
    }
    counts = {t: len(r) for t, r in payload.items()}
    print("Row counts:", counts, flush=True)

    if dry_run:
        print("Dry run — not writing to Supabase.", flush=True)
        return counts

    sb = _client()
    # Parent first (children FK to it), then rebuild children.
    _upsert(sb, "eca_submissions", payload["eca_submissions"], on_conflict="submission_id")
    for t in CHILD_TABLES:
        _clear(sb, t)
        _upsert(sb, t, payload[t])

    meta = ds.meta
    sb.table("eca_sync_meta").upsert({
        "id": 1,
        "refreshed_at": pd.Timestamp.now("UTC").isoformat(),
        "source": meta.get("source"),
        "submission_count": int(meta.get("raw_count", len(events))),
        "event_count": int(meta.get("event_count", len(events))),
        "real_count": int(meta.get("real_count", 0)),
        "test_count": int(meta.get("test_count", 0)),
        "choices_provisional": bool(meta.get("choices_provisional", False)),
    }, on_conflict="id").execute()
    print("Sync complete.", flush=True)
    return counts


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Sync ECA events data into Supabase.")
    ap.add_argument("--source", default=os.environ.get("ECA_DATA_SOURCE", "auto"),
                    choices=["live", "cache", "synthetic", "auto"])
    ap.add_argument("--dry-run", action="store_true", help="Build + report counts, no writes.")
    args = ap.parse_args()
    sync(args.source, dry_run=args.dry_run)
