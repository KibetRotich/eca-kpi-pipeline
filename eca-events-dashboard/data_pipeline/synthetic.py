"""
Synthetic sample-data generator.

Produces a JSON file shaped EXACTLY like the raw MCP ``get_submissions`` output
(group-prefixed scalar keys, nested repeat arrays, ``_id``/``_submission_time``/
``_geolocation`` meta) so the whole pipeline can be developed and tested offline
without live credentials.

Deliberately exercises the tricky cases the real data contains:
  * two form "versions": old (participant[] repeat, no real_test) and new
    (selected_participants known-farmer list, intro__real_test)
  * a mix of real and test records
  * all four countries with country-appropriate admin-level titles
  * multi-select fields with 1..n space-delimited codes
  * missing GPS / photos / attendance sheets (for completeness scoring)
  * duplicate farmers across events (same farmer_id and same name)

Run:  python -m data_pipeline.synthetic   (writes sample_data/synthetic_submissions.json)
"""
from __future__ import annotations

import json
import os
import random
from datetime import date, datetime, timedelta

from config import SYNTHETIC_PATH

RNG = random.Random(20260701)  # deterministic

COUNTRIES = {
    "kenya":    {"a1": ["makueni", "bungoma", "kisumu"], "a1t": "county", "a2t": "sub-county", "a3t": "ward",
                 "gps": (-1.9, 37.6), "projects": ["csv_ke", "p4g_synnefa", "save_ke"]},
    "uganda":   {"a1": ["lango", "acholi", "mbale"], "a1t": "region", "a2t": "district", "a3t": "sub-county",
                 "gps": (1.3, 32.5), "projects": ["icam_ug", "hc_ug"]},
    "tanzania": {"a1": ["arusha", "mbeya", "morogoro"], "a1t": "region", "a2t": "district", "a3t": "ward",
                 "gps": (-6.8, 37.6), "projects": ["pfc_tz", "p2p_tz"]},
    "ethiopia": {"a1": ["oromia", "amhara", "sidama"], "a1t": "region", "a2t": "zone", "a3t": "woreda",
                 "gps": (8.9, 38.7), "projects": ["odfb_eth", "acting_now_eth"]},
}
COMMODITY = [("crop", "fruits_vegetables"), ("crop", "coffee"), ("crop", "maize"),
             ("livestock", "dairy"), ("crop", "cocoa")]
EVENT_TYPES = ["training", "meeting", "field_day", "demonstration", "workshop"]
TRAINING_TYPES = ["on_farm_training", "classroom_training", "demo_plot_training"]
BENEFICIARY = ["farmers", "vsla_members", "cooperative", "community_leaders",
               "community_members", "service_providers", "youth"]
TOPICS = ["climate_smart_agric", "soil_smart_practices", "crop_smart_practices",
          "agroforestry", "gender_equality", "post_harvest_handling",
          "financial_literacy", "record_keeping", "carbon_farming"]
MODULES = ["module_1_intro", "module_2_soil", "module_3_water", "module_4_carbon",
           "module_5_gender"]
MANUALS = ["carbon_farming_academy", "gender_training_manual", "gap_manual", "other"]
FACIL_TYPES = ["solidaridad_staff", "tot_lead_farmer", "partner_staff", "extension_officer"]
ENUMERATORS = ["Grace Wanjiku", "Peter Otieno", "Amina Hassan", "Joseph Mwangi",
               "Sarah Nabirye", "Daniel Kato", "Fatuma Ali"]

FIRST = ["John", "Mary", "Peter", "Grace", "Samuel", "Faith", "David", "Esther",
         "Joseph", "Ruth", "Daniel", "Sarah", "James", "Anne", "Moses", "Jane"]
LAST = ["Kororia", "Otieno", "Mwangi", "Nabirye", "Kato", "Ali", "Wanjiku",
        "Chebet", "Barasa", "Mutinda", "Ochieng", "Njoroge"]


def _gps(base, jitter=0.4, missing=False):
    if missing:
        return ""
    lat = base[0] + RNG.uniform(-jitter, jitter)
    lon = base[1] + RNG.uniform(-jitter, jitter)
    return f"{lat:.6f} {lon:.6f} {RNG.uniform(900, 1500):.1f} {RNG.uniform(3, 8):.2f}"


def _multi(pool, kmin=1, kmax=4):
    k = RNG.randint(kmin, min(kmax, len(pool)))
    return " ".join(RNG.sample(pool, k))


def _photos(n):
    ts = int(RNG.uniform(1.6e12, 1.78e12))
    return [{"photos/event_photo": f"{ts + i}.jpg"} for i in range(n)]


def _sheets(n):
    ts = int(RNG.uniform(1.6e12, 1.78e12))
    return [{"sheet_page/attendance_sheet_page": f"{ts + i}.jpg"} for i in range(n)]


# A shared farmer pool so the same farmer recurs across events (dedup testing).
_FARMER_POOL = []
for i in range(300):
    cc = RNG.choice(list(COUNTRIES))
    _FARMER_POOL.append({
        "id": f"{cc[:2].upper()}DD{RNG.randint(100000, 999999)}",
        "first": RNG.choice(FIRST),
        "last": RNG.choice(LAST),
        "gender": RNG.choice(["male", "female"]),
        "age_group": RNG.choice(["below_35", "above_35"]),
        "disability": RNG.choices(["no", "yes"], weights=[95, 5])[0],
        "phone": f"07{RNG.randint(10000000, 99999999)}",
        "country": cc,
    })


def _make_participant_repeat(country, k):
    """Old-version style: inline participant[] repeat with demographics."""
    pool = [f for f in _FARMER_POOL if f["country"] == country] or _FARMER_POOL
    rows = []
    for f in RNG.sample(pool, min(k, len(pool))):
        has_id = RNG.random() < 0.4
        row = {
            "participant/has_farmer_id": "yes" if has_id else "no",
            "participant/first_name": f["first"],
            "participant/last_name": f["last"],
            "participant/phone_number": f["phone"],
            "participant/gender": f["gender"],
            "participant/age_group": f["age_group"],
            "participant/disability": f["disability"],
        }
        if has_id:
            row["participant/farmer_id"] = f["id"]
        rows.append(row)
    return rows


def _make_selected(country, k):
    """New-version style: 'internal__CODE' tokens from known-farmer list."""
    pool = [f for f in _FARMER_POOL if f["country"] == country] or _FARMER_POOL
    chosen = RNG.sample(pool, min(k, len(pool)))
    return " ".join(f"{RNG.randint(100000, 999999)}__{f['id']}" for f in chosen)


def make_submission(i: int) -> dict:
    country = RNG.choice(list(COUNTRIES))
    cfg = COUNTRIES[country]
    new_version = RNG.random() < 0.6  # 60% modern records
    d = date(2023, 1, 1) + timedelta(days=RNG.randint(0, 1180))
    cat, spec = RNG.choice(COMMODITY)
    total = RNG.randint(8, 60)
    female = RNG.randint(0, total)
    myouth = RNG.randint(0, total - female)
    fyouth = RNG.randint(0, female)
    is_test = RNG.random() < 0.05

    a1 = RNG.choice(cfg["a1"])
    a2 = RNG.choice(["Central", "North", "South", "East", "West"]) + " " + a1.title()
    sub = {
        "_id": 100000 + i,
        "formhub__uuid": "synthetic-uuid",
        "start": f"{d.isoformat()}T09:00:00+03:00",
        "end": f"{d.isoformat()}T12:00:00+03:00",
        "general_deatils__training_date": d.isoformat(),
        "general_deatils__country": country,
        "general_deatils__admin_level_1": a1,
        "general_deatils__admin_level_2": a2 if RNG.random() > 0.08 else "",  # some missing
        "general_deatils__admin_level_3": RNG.choice(["", "Village A", "Kebele 3", "Zone 2"]),
        "general_deatils__training_location": RNG.choice(["Central Hall", "Demo Farm", "Cooperative Office"]),
        "general_deatils__location_gps": _gps(cfg["gps"], missing=RNG.random() < 0.12),
        "general_deatils__project": RNG.choice(cfg["projects"]),
        "general_deatils__organization_name": RNG.choice(["", "Umoja Cooperative", "Tuinuane VSLA", "Green Growers"]),
        "agenda__training_title": RNG.choice(["CSA Training", "Gender Dialogue", "Soil Health", "Market Linkage"]),
        "agenda__training_topic": _multi(TOPICS, 1, 5),
        "agenda__is_training_manual_used": RNG.choice(["yes", "no"]),
        "conclusion__enumarator_names": RNG.choice(ENUMERATORS),
        "conclusion__comment": RNG.choice(["", "Good turnout", "Rain disrupted session", "None"]),
        "__version__": "vSynthNew" if new_version else "vSynthOld",
        "_submission_time": (datetime.combine(d, datetime.min.time())
                             + timedelta(days=RNG.randint(0, 20), hours=RNG.randint(8, 18))).isoformat(),
        "_geolocation": [None, None],
        "_submitted_by": RNG.choice(["eca_datacollection4", "eca_kobo_data_lake", None]),
    }

    # Manual details when used
    if sub["agenda__is_training_manual_used"] == "yes":
        m = RNG.choice(MANUALS)
        sub["agenda__manual_name"] = m
        if m == "other":
            sub["agenda__manual_name_other"] = "Custom field manual"
        if m in ("carbon_farming_academy",):
            sub["agenda__training_modules"] = _multi(MODULES, 1, 5)

    # Facilitators (1-3)
    nfac = RNG.randint(1, 3)
    sub["facilitator"] = [
        {"facilitator/facilitator_type": RNG.choice(FACIL_TYPES),
         "facilitator/facilitator_names": f"{RNG.choice(FIRST)} {RNG.choice(LAST)}",
         "facilitator/organization": RNG.choice(["Solidaridad", "Partner NGO", "County Govt"])}
        for _ in range(nfac)
    ]

    # Photos / attendance sheets (sometimes missing)
    sub["photos"] = _photos(RNG.randint(0, 4))
    sub["sheet_page"] = _sheets(RNG.randint(0, 3))

    if new_version:
        sub["intro__real_test"] = "test" if is_test else "real"
        sub["general_deatils__event_type"] = RNG.choice(EVENT_TYPES)
        sub["general_deatils__training_type"] = RNG.choice(TRAINING_TYPES)
        sub["general_deatils__admin_level_1_title"] = cfg["a1t"]
        sub["general_deatils__admin_level_2_title"] = cfg["a2t"]
        sub["general_deatils__admin_level_3_title"] = cfg["a3t"]
        sub["general_deatils__project_commodity_category"] = cat
        sub["general_deatils__project_commodity_specific"] = spec
        sub["general_deatils__beneficiary_type"] = _multi(BENEFICIARY, 1, 4)
        sub["general_deatils__total_participants"] = str(total)
        sub["general_deatils__female_participants"] = str(female)
        sub["general_deatils__male_youth_participants"] = str(myouth)
        sub["general_deatils__female_youth_participants"] = str(fyouth)
        sub["general_deatils__youth_participants"] = str(myouth + fyouth)
        sub["selected_participant__selected_participants"] = _make_selected(country, RNG.randint(0, min(total, 40)))
        sub["selected_participant__additional_participants_exists"] = RNG.choice(["yes", "no"])
        sub["conclusion__next_training_date"] = (d + timedelta(days=RNG.randint(7, 60))).isoformat()
        # New-version records may still carry a few inline participants.
        if RNG.random() < 0.25:
            sub["participant"] = _make_participant_repeat(country, RNG.randint(1, 6))
        else:
            sub["participant"] = []
    else:
        # Old version: no real_test, inline participant repeat carries reach.
        k = RNG.randint(1, 12)
        sub["participant"] = _make_participant_repeat(country, k)
        sub["general_deatils__is_organization_activity"] = RNG.choice(["yes", "no"])

    return sub


def generate(n: int = 450) -> list[dict]:
    return [make_submission(i) for i in range(n)]


def main(n: int = 450, path: str = SYNTHETIC_PATH):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subs = generate(n)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(subs, fh, ensure_ascii=False, indent=1)
    reals = sum(1 for s in subs if s.get("intro__real_test") != "test")
    print(f"Wrote {len(subs)} synthetic submissions to {path} ({reals} real).")


if __name__ == "__main__":
    main()
