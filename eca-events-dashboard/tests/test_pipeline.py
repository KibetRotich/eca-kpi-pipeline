"""
Pipeline unit tests.

Covers the four behaviours called out in the brief plus the derived fields:
  * choice decoding (map hit + humanise fallback)
  * multi-select explosion into long format
  * repeat-group flattening + join
  * farmer dedup / unverified-identity flagging
  * derived fields (%female/%youth, completeness, capture rate, test filter,
    admin-level resolution, version drift)
"""
import numpy as np
import pandas as pd
import pytest

from data_pipeline.decode import Decoder, humanize
from data_pipeline.flatten import canonical_name, flatten_submissions
from data_pipeline.transform import (
    enrich_events,
    enrich_participants,
    explode_multiselect,
    explode_selected_participants,
)


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def decoder():
    return Decoder({
        "field_to_list": {"country": "country", "gender": "gender",
                          "beneficiary_type": "beneficiary_type"},
        "lists": {
            "country": {"kenya": "Kenya"},
            "gender": {"male": "Male", "female": "Female"},
            "beneficiary_type": {"farmers": "Farmers", "vsla_members": "VSLA Members"},
        },
    })


@pytest.fixture
def new_submission():
    """Modern-version record: real_test, selected_participants, headcounts."""
    return {
        "_id": 1,
        "intro__real_test": "real",
        "general_deatils__training_date": "2026-05-25",
        "general_deatils__country": "kenya",
        "general_deatils__event_type": "training",
        "general_deatils__admin_level_1": "makueni",
        "general_deatils__admin_level_1_title": "county",
        "general_deatils__admin_level_2": "Kathonzweni",
        "general_deatils__admin_level_2_title": "sub-county",
        "general_deatils__project": "p4g_synnefa",
        "general_deatils__beneficiary_type": "farmers vsla_members community_leaders",
        "general_deatils__total_participants": "40",
        "general_deatils__female_participants": "20",
        "general_deatils__male_youth_participants": "0",
        "general_deatils__female_youth_participants": "6",
        "general_deatils__youth_participants": "6",
        "general_deatils__location_gps": "-1.84 37.71 1076.9 0.5",
        "agenda__training_topic": "climate_smart_agric soil_smart_practices",
        "selected_participant__selected_participants": "111__KEDD001 222__KEDD002 333__KEDD003",
        "participant": [],
        "facilitator": [{"facilitator/facilitator_type": "solidaridad_staff",
                        "facilitator/facilitator_names": "Jane Doe"}],
        "photos": [{"photos/event_photo": "a.jpg"}],
        "sheet_page": [],
        "_submission_time": "2026-06-01T10:00:00",
    }


@pytest.fixture
def old_submission():
    """Legacy record: no real_test, inline participant[] repeat, no GPS title."""
    return {
        "_id": 2,
        "general_deatils__training_date": "2023-10-27",
        "general_deatils__country": "uganda",
        "general_deatils__admin_level_1": "lango",
        "general_deatils__project": "icam_ug",
        "agenda__training_topic": "agroforestry",
        "participant": [
            {"participant/has_farmer_id": "yes", "participant/farmer_id": "UGDD100",
             "participant/first_name": "John", "participant/last_name": "M",
             "participant/gender": "male", "participant/age_group": "below_35",
             "participant/disability": "no"},
            {"participant/has_farmer_id": "no", "participant/first_name": "Mary",
             "participant/last_name": "K", "participant/phone_number": "0700",
             "participant/gender": "female", "participant/age_group": "above_35",
             "participant/disability": "no"},
            # duplicate of the first farmer (same id) in a different row
            {"participant/has_farmer_id": "yes", "participant/farmer_id": "UGDD100",
             "participant/first_name": "John", "participant/last_name": "M",
             "participant/gender": "male", "participant/age_group": "below_35",
             "participant/disability": "no"},
        ],
        "facilitator": [],
        "photos": [],
        "sheet_page": [],
        "_submission_time": "2023-11-19T14:44:00",
    }


@pytest.fixture
def test_submission():
    return {"_id": 3, "intro__real_test": "test",
            "general_deatils__country": "kenya",
            "general_deatils__training_date": "2026-01-01",
            "participant": [], "facilitator": [], "photos": [], "sheet_page": []}


# ── canonicalisation ──────────────────────────────────────────────────────────

def test_canonical_name_strips_group_prefix():
    assert canonical_name("general_deatils__country") == "country"
    assert canonical_name("intro__real_test") == "real_test"
    assert canonical_name("selected_participant__selected_participants") == "selected_participants"

def test_canonical_name_preserves_system_keys():
    assert canonical_name("_id") == "_id"
    assert canonical_name("_submission_time") == "_submission_time"
    assert canonical_name("__version__") == "__version__"
    assert canonical_name("meta__instanceID") == "meta__instanceID"


# ── decoding ──────────────────────────────────────────────────────────────────

def test_decode_map_hit(decoder):
    assert decoder.label("country", "kenya") == "Kenya"
    assert decoder.label("gender", "female") == "Female"

def test_decode_humanise_fallback(decoder):
    # code not in the map -> humanised
    assert decoder.label("country", "somewhere_new") == "Somewhere New"
    assert humanize("tot_lead_farmer") == "Tot Lead Farmer"
    assert humanize("vsla_members") == "VSLA Members"

def test_decode_empty(decoder):
    assert decoder.label("country", "") == ""
    assert decoder.label("country", None) == ""


# ── repeat flattening ─────────────────────────────────────────────────────────

def test_flatten_repeat_groups(old_submission):
    flat = flatten_submissions([old_submission])
    assert len(flat.events) == 1
    # 3 participant rows joined to the parent event
    assert len(flat.participants) == 3
    assert (flat.participants["event_id"] == 2).all()
    assert "farmer_id" in flat.participants.columns
    # child field prefix stripped
    assert "first_name" in flat.participants.columns

def test_flatten_counts_and_completeness(new_submission):
    flat = flatten_submissions([new_submission])
    row = flat.events.iloc[0]
    assert row["n_facilitators"] == 1
    assert row["n_photos"] == 1
    assert row["n_sheet_pages"] == 0
    assert row["has_gps"] is True or row["has_gps"] == True  # noqa: E712
    assert row["has_photo"] == True  # noqa: E712
    assert row["has_attendance_sheet"] == False  # noqa: E712

def test_gps_parsed(new_submission):
    flat = flatten_submissions([new_submission])
    row = flat.events.iloc[0]
    assert row["lat"] == pytest.approx(-1.84)
    assert row["lon"] == pytest.approx(37.71)


# ── multi-select explosion ────────────────────────────────────────────────────

def test_explode_multiselect(new_submission, decoder):
    flat = flatten_submissions([new_submission])
    events = enrich_events(flat.events, decoder)
    long = explode_multiselect(events, "beneficiary_type", decoder)
    assert len(long) == 3  # farmers, vsla_members, community_leaders
    codes = set(long["code"])
    assert codes == {"farmers", "vsla_members", "community_leaders"}
    labels = set(long["label"])
    assert "Farmers" in labels and "VSLA Members" in labels
    # unknown code humanised
    assert "Community Leaders" in labels

def test_explode_selected_participants(new_submission):
    flat = flatten_submissions([new_submission])
    events = enrich_events(flat.events)
    sp = explode_selected_participants(events)
    assert len(sp) == 3
    assert set(sp["beneficiary_code"]) == {"KEDD001", "KEDD002", "KEDD003"}


# ── derived fields ────────────────────────────────────────────────────────────

def test_derived_reach_metrics(new_submission):
    events = enrich_events(flatten_submissions([new_submission]).events)
    row = events.iloc[0]
    assert row["pct_female"] == pytest.approx(50.0)     # 20/40
    assert row["pct_youth"] == pytest.approx(15.0)      # 6/40
    # individual records = 0 repeat + 3 selected
    assert row["n_individual_records"] == 3
    assert row["individual_capture_rate"] == pytest.approx(7.5)  # 3/40

def test_youth_backfill_from_components():
    sub = {"_id": 9, "intro__real_test": "real",
           "general_deatils__total_participants": "10",
           "general_deatils__male_youth_participants": "2",
           "general_deatils__female_youth_participants": "3",
           # youth_participants missing -> backfilled to 5
           "participant": [], "facilitator": [], "photos": [], "sheet_page": []}
    events = enrich_events(flatten_submissions([sub]).events)
    assert events.iloc[0]["youth_participants"] == 5

def test_admin_title_resolution(new_submission, old_submission):
    events = enrich_events(flatten_submissions([new_submission, old_submission]).events)
    kenya = events[events["country"] == "kenya"].iloc[0]
    uganda = events[events["country"] == "uganda"].iloc[0]
    # new record uses form calc title
    assert kenya["admin_level_1_title_resolved"] == "County"
    assert kenya["admin_level_2_title_resolved"] == "Sub-County"
    # old record has no calc title -> country default map (Uganda L1 = Region)
    assert uganda["admin_level_1_title_resolved"] == "Region"

def test_completeness_score(new_submission):
    events = enrich_events(flatten_submissions([new_submission]).events)
    row = events.iloc[0]
    # gps=1, photo=1, sheet=0, admin2 present=1 -> 3/4 = 75%
    assert row["completeness_score"] == pytest.approx(75.0)


# ── test/real filtering + version drift ───────────────────────────────────────

def test_test_flagging_and_missing_is_real(new_submission, old_submission, test_submission):
    events = enrich_events(
        flatten_submissions([new_submission, old_submission, test_submission]).events)
    by_id = events.set_index("event_id")
    assert by_id.loc[1, "is_test"] == False   # explicit real   # noqa: E712
    assert by_id.loc[2, "is_test"] == False   # missing -> real # noqa: E712
    assert by_id.loc[3, "is_test"] == True    # explicit test   # noqa: E712
    assert by_id.loc[2, "is_real"] == True                      # noqa: E712


# ── farmer dedup / identity ────────────────────────────────────────────────────

def test_farmer_dedup_and_identity(old_submission):
    flat = flatten_submissions([old_submission])
    events = enrich_events(flat.events)
    parts = enrich_participants(flat.participants, events)
    # 3 rows, but the two John/UGDD100 rows share a farmer_key -> 2 unique
    assert len(parts) == 3
    assert parts["farmer_key"].nunique() == 2
    # verified where farmer_id present, unverified for name-only
    assert (parts["identity_status"] == "verified").sum() == 2
    assert (parts["identity_status"] == "unverified").sum() == 1
    # the id-based key is prefixed 'id:', name-based 'name:'
    assert parts.loc[parts["identity_status"] == "verified", "farmer_key"].iloc[0].startswith("id:")


def test_participant_youth_flag(old_submission):
    flat = flatten_submissions([old_submission])
    events = enrich_events(flat.events)
    parts = enrich_participants(flat.participants, events)
    below = parts[parts["age_group"] == "below_35"]
    above = parts[parts["age_group"] == "above_35"]
    assert below["is_youth"].all()
    assert not above["is_youth"].any()
