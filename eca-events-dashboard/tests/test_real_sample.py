"""
Validate the pipeline against REAL submissions captured verbatim from the live
form (via the MCP get_submissions tool) — one 2023 old-version record and two
2026 new-version records. This checks the pipeline against actual structure
(not just our synthetic model of it): group prefixes, version drift, real
headcounts, and the real ``selected_participants`` token format incl. the
``124016__KEDDH540-D5`` suffix.
"""
import json
import os

import pytest

from data_pipeline.flatten import flatten_submissions
from data_pipeline.transform import (
    enrich_events,
    enrich_facilitators,
    enrich_participants,
    explode_multiselect,
    explode_selected_participants,
)

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "real_sample_submissions.json")


@pytest.fixture(scope="module")
def real():
    with open(FIXTURE, "r", encoding="utf-8") as fh:
        subs = json.load(fh)
    flat = flatten_submissions(subs)
    events = enrich_events(flat.events)
    return {
        "events": events,
        "participants": enrich_participants(flat.participants, events),
        "facilitators": enrich_facilitators(flat.facilitators, events),
        "selected": explode_selected_participants(events),
        "beneficiary": explode_multiselect(events, "beneficiary_type"),
        "topics": explode_multiselect(events, "training_topic"),
    }


def _by_id(events):
    return events.set_index("event_id")


def test_three_real_events_flatten(real):
    ev = real["events"]
    assert len(ev) == 3
    for col in ["country", "training_date", "project", "total_participants",
                "country_label", "project_label"]:
        assert col in ev.columns


def test_real_test_missing_is_real_2023(real):
    e = _by_id(real["events"])
    # 2023 record has no real_test field -> treated as real
    assert e.loc[282732385, "is_test"] == False   # noqa: E712
    assert e.loc[282732385, "is_real"] == True     # noqa: E712
    # 2026 records explicitly real
    assert e.loc[779056375, "is_real"] == True     # noqa: E712


def test_real_headcount_and_pct(real):
    e = _by_id(real["events"])
    r = e.loc[779056375]
    assert r["total_participants"] == 40
    assert r["female_participants"] == 24
    assert r["pct_female"] == pytest.approx(60.0)
    assert r["youth_participants"] == 3
    assert r["pct_youth"] == pytest.approx(7.5)


def test_real_admin_titles_and_labels(real):
    e = _by_id(real["events"])
    r = e.loc[779056375]
    assert r["admin_level_1_title_resolved"] == "County"
    assert r["admin_level_2_title_resolved"] == "Sub-County"
    assert r["country_label"] == "Kenya"
    # old 2023 record has no calc title -> Kenya default map (County)
    assert e.loc[282732385, "admin_level_1_title_resolved"] == "County"


def test_real_selected_participant_token_split(real):
    sp = real["selected"]
    row = sp[sp["event_id"] == 779056375]
    assert len(row) == 4
    codes = set(row["beneficiary_code"])
    # first '__' splits internal id from code; suffix after code is preserved
    assert "KEDDH540-D5" in codes
    assert "KEDDH542" in codes


def test_real_multiselect_beneficiary(real):
    b = real["beneficiary"]
    row = b[b["event_id"] == 787237448]
    assert set(row["code"]) == {"vsla_members", "farmers"}
    # Authoritative labels from the form's beneficiary_types choice list.
    assert set(row["label"]) == {"VSLA members", "Farmers"}


def test_real_completeness_and_repeats(real):
    e = _by_id(real["events"])
    r = e.loc[779056375]
    # gps present, no photos key at all, 3 attendance sheets, admin2 present
    assert r["n_photos"] == 0 and r["has_photo"] == False       # noqa: E712
    assert r["n_sheet_pages"] == 3 and r["has_attendance_sheet"] == True  # noqa: E712
    assert r["has_gps"] == True                                  # noqa: E712
    # gps=1, photo=0, sheet=1, admin2=1 -> 75%
    assert r["completeness_score"] == pytest.approx(75.0)
    # two facilitators on 787237448
    assert e.loc[787237448, "n_facilitators"] == 2


def test_real_participant_repeat(real):
    parts = real["participants"]
    p = parts[parts["event_id"] == 282732385]
    assert len(p) == 1
    assert p.iloc[0]["gender_label"] == "Male"
    assert p.iloc[0]["identity_status"] == "unverified"  # has_farmer_id = no
