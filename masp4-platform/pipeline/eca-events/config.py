"""
Central configuration for the ECA Trainings & Events Tracker dashboard.

Everything that is likely to change when the KoBo form is updated lives here or
in ``choices.json`` — so a form revision rarely needs code changes elsewhere.

Field-name philosophy
----------------------
The live KoBo JSON prefixes every question with its group, e.g.
``general_deatils__country``, and those prefixes have changed across form
versions (``real_test`` -> ``intro__real_test``; the participant-list group was
added later). We therefore treat **the data columns as ground truth for what
exists** and normalise a column to its canonical name by stripping everything
up to and including the last ``__``. The XLSForm is authoritative only for
code -> label decoding (see ``choices.json``).
"""
from __future__ import annotations

import os

# ── Form identity ────────────────────────────────────────────────────────────
FORM_UID = "aCt5s6EGUnE7UxJVeuXjpY"
FORM_NAME = "ECA Trainings and Events Tracker"

# Where the pipeline reads/writes its local cache of raw MCP submissions.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BASE_DIR, "data_pipeline", "cache")
RAW_CACHE_PATH = os.path.join(CACHE_DIR, "raw_submissions.json")
CHOICES_PATH = os.path.join(BASE_DIR, "choices.json")
SYNTHETIC_PATH = os.path.join(BASE_DIR, "data_pipeline", "sample_data", "synthetic_submissions.json")

# ── Repeat groups (arrive as nested JSON arrays keyed to the parent) ──────────
# name -> child-key prefix used inside each repeat item ("participant/first_name")
REPEAT_GROUPS = {
    "participant": "participant",
    "facilitator": "facilitator",
    "photos": "photos",
    "sheet_page": "sheet_page",
}

# ── Multi-select fields: space-delimited codes in the raw export ──────────────
MULTISELECT_FIELDS = ["beneficiary_type", "training_topic", "training_modules"]

# ``selected_participants`` is space-delimited but each token is
# "<internal_id>__<beneficiary_code>" rather than a plain choice code.
SELECTED_PARTICIPANTS_FIELD = "selected_participants"

# ── Fields that must never be shown on shared/aggregate views (PII) ───────────
# Row-level detail is gated behind an explicit permission toggle in the app.
PII_FIELDS = [
    "phone_number",
    "farmer_id",
    "national_identity",
    "first_name",
    "last_name",
    "facilitator_names",
    "enumarator_names",  # enumerator name is shown in aggregate DQ page only
]
# Shown only in aggregate, never at row level outside the gated detail view.
SENSITIVE_AGGREGATE_ONLY = ["disability"]

# ── real/test marker ──────────────────────────────────────────────────────────
REAL_TEST_FIELD = "real_test"
# Records collected before this field existed have no value -> treated as REAL.
REAL_TEST_MISSING_IS_REAL = True

# ── Country-conditional administrative-level labels ───────────────────────────
# Used as a fallback when the form's calculated ``admin_level_N_title`` fields
# are absent (older versions). When present in the data, those calc values win.
ADMIN_LEVELS = {
    "kenya":    {"1": "County",  "2": "Sub-county", "3": "Ward"},
    "uganda":   {"1": "Region",  "2": "District",   "3": "Sub-county"},
    "tanzania": {"1": "Region",  "2": "District",   "3": "Ward"},
    "ethiopia": {"1": "Region",  "2": "Zone",       "3": "Woreda"},
}
DEFAULT_ADMIN_LEVELS = {"1": "Admin Level 1", "2": "Admin Level 2", "3": "Admin Level 3"}

# ── Carbon Farming Academy — module completion tracker (Curriculum page) ──────
# The full ordered curriculum, used for the coverage-vs-defined gap chart. This
# is refreshed from the XLSForm ``training_modules`` choice list (see
# tools/refresh_choices.py). The provisional list below is superseded by
# choices.json once the authoritative list is pulled.
CARBON_FARMING_ACADEMY_MANUAL_CODES = [
    "carbon_farming_academy",
    "carbon_farming_manual",
]

# ── Youth threshold (per the form: 35 years and below) ────────────────────────
YOUTH_MAX_AGE = 35

# ── Cache freshness ───────────────────────────────────────────────────────────
# Full re-fetch is fine at ~7k rows; we cache the processed frame in-process via
# st.cache_data and persist raw submissions to disk so the app can run offline.
CACHE_TTL_SECONDS = int(os.environ.get("ECA_CACHE_TTL", "3600"))
