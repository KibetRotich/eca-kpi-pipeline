"""
Pipeline orchestrator.

``build_dataset()`` runs the full flatten -> enrich -> explode chain and returns
a :class:`Dataset` bundle of tidy DataFrames plus run metadata. The Streamlit
layer wraps this in ``st.cache_data`` so it runs once per data refresh, not on
every filter change.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from data_pipeline.decode import get_decoder
from data_pipeline.flatten import flatten_submissions
from data_pipeline.ingest import get_raw_submissions
from data_pipeline.transform import (
    enrich_events,
    enrich_facilitators,
    enrich_participants,
    explode_multiselect,
    explode_selected_participants,
)
from config import MULTISELECT_FIELDS


@dataclass
class Dataset:
    events: pd.DataFrame                      # one row per submission (enriched)
    participants: pd.DataFrame                # one row per participant repeat item
    facilitators: pd.DataFrame                # one row per facilitator repeat item
    selected_participants: pd.DataFrame       # long: known-farmer selections
    multiselect: dict                         # field -> long exploded frame
    meta: dict = field(default_factory=dict)

    @property
    def choices_are_provisional(self) -> bool:
        return bool(self.meta.get("choices_provisional", True))

    @property
    def last_refresh(self):
        return self.meta.get("refreshed_at")


def build_dataset(source: str = "auto") -> Dataset:
    raw, ingest_meta = get_raw_submissions(source)
    decoder = get_decoder()

    flat = flatten_submissions(raw)
    events = enrich_events(flat.events, decoder)
    participants = enrich_participants(flat.participants, events, decoder)
    facilitators = enrich_facilitators(flat.facilitators, events, decoder)
    selected = explode_selected_participants(events)
    multiselect = {f: explode_multiselect(events, f, decoder) for f in MULTISELECT_FIELDS}

    meta = {
        "refreshed_at": ingest_meta.get("refreshed_at"),
        "source": ingest_meta.get("source"),
        "raw_count": len(raw),
        "event_count": len(events),
        "real_count": int(events["is_real"].sum()) if "is_real" in events else len(events),
        "test_count": int(events["is_test"].sum()) if "is_test" in events else 0,
        "choices_provisional": decoder.is_provisional,
    }
    return Dataset(
        events=events,
        participants=participants,
        facilitators=facilitators,
        selected_participants=selected,
        multiselect=multiselect,
        meta=meta,
    )
