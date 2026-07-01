"""
Test the authoritative-choices builder (tools/refresh_choices.py) with a payload
shaped like the MCP get_form_content response. This function is on the critical
path to the real decode map (runs after the MCP reconnect), so it is validated
here before that switchover.

Crucially it asserts the join lines up: field_to_list is keyed by the BARE
question name (`country`, `event_type`) exactly as data_pipeline.transform /
decode look fields up.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from data_pipeline.decode import Decoder  # noqa: E402
from tools.refresh_choices import choices_from_form_content  # noqa: E402

PAYLOAD = {
    "translations": ["English (en)", "Swahili (sw)"],
    "survey": [
        {"type": "select_one country", "name": "country"},
        {"type": "select_multiple beneficiary_type", "name": "beneficiary_type"},
        # list name carried in the dedicated column rather than inline in type
        {"type": "select_one", "name": "event_type", "select_from_list_name": "event_type_list"},
        {"type": "text", "name": "training_title"},
        {"type": "begin_group", "name": "general_deatils"},
    ],
    "choices": [
        {"list_name": "country", "name": "kenya", "label": ["Kenya", "Kenya"]},
        {"list_name": "country", "name": "uganda", "label": ["Uganda", "Uganda"]},
        {"list_name": "beneficiary_type", "name": "farmers", "label": ["Farmers", "Wakulima"]},
        {"list_name": "event_type_list", "name": "meeting", "label": ["Meeting", "Mkutano"]},
    ],
}


def test_field_to_list_uses_bare_names():
    out = choices_from_form_content(PAYLOAD)
    ftl = out["field_to_list"]
    # inline "select_one <list>" form
    assert ftl["country"] == "country"
    assert ftl["beneficiary_type"] == "beneficiary_type"
    # select_from_list_name column form
    assert ftl["event_type"] == "event_type_list"
    # non-select fields excluded
    assert "training_title" not in ftl


def test_lists_prefer_english_label():
    out = choices_from_form_content(PAYLOAD)
    assert out["lists"]["country"]["kenya"] == "Kenya"
    assert out["lists"]["beneficiary_type"]["farmers"] == "Farmers"  # not "Wakulima"
    assert out["lists"]["event_type_list"]["meeting"] == "Meeting"


def test_meta_marked_authoritative():
    out = choices_from_form_content(PAYLOAD)
    assert out["_meta"]["source"] == "authoritative"


def test_join_with_decoder_end_to_end():
    """The builder output plugs straight into the Decoder used by the pipeline."""
    out = choices_from_form_content(PAYLOAD)
    dec = Decoder(out)
    assert not dec.is_provisional
    assert dec.label("country", "kenya") == "Kenya"
    assert dec.label("event_type", "meeting") == "Meeting"        # via select_from_list_name
    assert dec.label("beneficiary_type", "farmers") == "Farmers"
    # unknown code still humanised, not crash
    assert dec.label("country", "narnia") == "Narnia"
