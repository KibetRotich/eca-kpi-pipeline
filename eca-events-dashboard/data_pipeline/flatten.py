"""
Flatten raw KoBo submissions into tidy tables.

Input:  list[dict] — raw submissions exactly as returned by the MCP
        ``get_submissions`` tool (repeat groups are nested arrays, scalar
        fields are group-prefixed with ``__``).

Output: a ``FlatTables`` bundle of pandas DataFrames:
    - events        : one row per submission (canonical scalar columns + counts)
    - participants  : one row per ``participant[]`` repeat item (+ event_id)
    - facilitators  : one row per ``facilitator[]`` repeat item (+ event_id)

Canonicalisation strips the group prefix (everything up to and including the
last ``__``) so columns are stable across form versions. System/meta keys
(anything starting with ``_``, plus ``formhub__uuid``/``meta__*``/``__version__``)
are preserved verbatim.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from config import REPEAT_GROUPS

# Keys that are system/meta and must NOT be canonicalised by stripping ``__``.
_SYSTEM_KEYS = {"formhub__uuid", "__version__", "_xform_id_string"}


def canonical_name(key: str) -> str:
    """Map a raw column key to its canonical (group-stripped) name."""
    if key.startswith("_") or key in _SYSTEM_KEYS or key.startswith("meta__"):
        return key
    # Strip the group prefix: general_deatils__country -> country
    return key.split("__")[-1]


def _parse_gps(value) -> dict:
    """'lat lon alt acc' -> dict of floats (any missing -> None)."""
    out = {"lat": None, "lon": None, "altitude": None, "gps_accuracy": None}
    if not value:
        return out
    parts = str(value).split()
    keys = ["lat", "lon", "altitude", "gps_accuracy"]
    for k, p in zip(keys, parts):
        try:
            out[k] = float(p)
        except (ValueError, TypeError):
            out[k] = None
    return out


def _flatten_event_scalars(sub: dict) -> dict:
    """Canonicalise the scalar (non-repeat) fields of one submission."""
    row: dict = {}
    for key, val in sub.items():
        if key in REPEAT_GROUPS:
            continue  # handled as child tables
        if isinstance(val, list):
            # Any other nested array we don't model as a child table is skipped
            # for the event row (kept out to avoid unhashable cells).
            continue
        name = canonical_name(key)
        # Prefer the first non-empty value if a canonical collision occurs.
        if name in row and (val in (None, "") or row[name] not in (None, "")):
            continue
        row[name] = val
    return row


def _flatten_repeat(sub: dict, group: str, event_id) -> list[dict]:
    """Flatten one repeat group of a submission into child rows."""
    items = sub.get(group) or []
    prefix = REPEAT_GROUPS[group] + "/"
    rows = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        row = {"event_id": event_id, f"{group}_index": idx}
        for k, v in item.items():
            row[k[len(prefix):] if k.startswith(prefix) else canonical_name(k)] = v
        rows.append(row)
    return rows


@dataclass
class FlatTables:
    events: pd.DataFrame
    participants: pd.DataFrame
    facilitators: pd.DataFrame


def flatten_submissions(submissions: list[dict]) -> FlatTables:
    event_rows: list[dict] = []
    participant_rows: list[dict] = []
    facilitator_rows: list[dict] = []

    for sub in submissions:
        event_id = sub.get("_id")
        row = _flatten_event_scalars(sub)
        row["event_id"] = event_id

        # GPS split
        gps = _parse_gps(row.get("location_gps"))
        row.update(gps)

        # Repeat counts + completeness signals
        row["n_participants_recorded"] = len(sub.get("participant") or [])
        row["n_facilitators"] = len(sub.get("facilitator") or [])
        row["n_photos"] = len(sub.get("photos") or [])
        row["n_sheet_pages"] = len(sub.get("sheet_page") or [])
        row["has_gps"] = bool(gps["lat"] is not None and gps["lon"] is not None)
        row["has_photo"] = row["n_photos"] > 0
        row["has_attendance_sheet"] = row["n_sheet_pages"] > 0

        event_rows.append(row)
        participant_rows.extend(_flatten_repeat(sub, "participant", event_id))
        facilitator_rows.extend(_flatten_repeat(sub, "facilitator", event_id))

    events = pd.DataFrame(event_rows)
    participants = pd.DataFrame(participant_rows)
    facilitators = pd.DataFrame(facilitator_rows)
    return FlatTables(events=events, participants=participants, facilitators=facilitators)
