"""Cool Farm (CFP) transform: raw Kobo submission JSON -> analytics-store rows.

Pure functions, no I/O -- so the unit conversions and derivations can be tested
and reasoned about independently of the loader.

Design notes worth knowing before changing anything here:

* Key separator. The Kobo REST API emits top-level keys as "group/field"; the
  Kobo MCP tool normalises the same keys to "group__field". `get()` accepts
  either so this module works against both sources.
* Units. The source mixes acres/hectares, kg/tonnes/litres and per-acre/
  per-hectare rates. EVERYTHING is normalised on the way in; the raw value and
  its unit are always retained alongside so a reviewer can audit a conversion.
* Fertiliser N. The explicit fertiliser_n_* fields are populated in 11 of 2099
  rows (they only unlock for category=compose_own). The N/P/K percentages are
  instead parsed out of the fertiliser_type LABEL, e.g.
  "Cattle manure - 0.6% N" or "Compound NPK - 15% N / 15% K2O / 15% P2O5".
  That lifts coverage to ~79%.
* PII. farmer_first_name, farmer_other_names, phone_number and
  meta/instanceName are deliberately never read.
"""
import re

# --- unit constants ---------------------------------------------------
ACRE_HA = 0.404686           # 1 acre in hectares
PER_ACRE_PER_HA = 1 / ACRE_HA  # 2.471054: per-acre rate -> per-hectare rate

PII_FIELDS = ("farmer_first_name", "farmer_other_names", "phone_number")

RESIDUE_STREAMS = (
    "pruning", "leaf_litter", "fruit", "dead_plant", "end_of_life_cycle",
    "life_cycle_end_woody_roots", "life_cycle_end_leaves", "pulp_hask", "seed",
)
RESIDUE_FATES = (
    "burn", "heaps_pits", "aerobic_compost", "anaerobic_compost",
    "left_on_soil", "export",
)
# Streams that actually offer a burn fate -- used for residue_burn_share so the
# denominator isn't diluted by streams where burning was never an option.
BURN_STREAMS = (
    "pruning", "leaf_litter", "dead_plant", "end_of_life_cycle",
    "life_cycle_end_woody_roots", "life_cycle_end_leaves",
)

ORGANIC_TOKENS = ("manure", "digestate", "slurry", "compost", "litter")


# --- primitive accessors ---------------------------------------------
def get(row, group, field):
    """Fetch a grouped field, tolerating either '/' or '__' separators."""
    for sep in ("/", "__"):
        k = f"{group}{sep}{field}"
        if k in row:
            return row[k]
    return None


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.lower() in ("none", "n/a", "na"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def integer(v):
    f = num(v)
    return int(f) if f is not None else None


def boolean(v):
    s = (str(v).strip().lower() if v is not None else "")
    if s in ("yes", "true", "1"):
        return True
    if s in ("no", "false", "0"):
        return False
    return None


def text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# --- normalisation helpers -------------------------------------------
def area_to_ha(value, uom):
    """acres|hectares -> hectares."""
    v = num(value)
    if v is None:
        return None
    u = (text(uom) or "").lower()
    if u.startswith("acre"):
        return round(v * ACRE_HA, 6)
    return round(v, 6)


def per_area_to_per_ha(value, uom):
    """A count/density expressed per acre or per hectare -> per hectare."""
    v = num(value)
    if v is None:
        return None
    u = (text(uom) or "").lower()
    if u.startswith("acre"):
        return round(v * PER_ACRE_PER_HA, 4)
    return round(v, 4)


def rate_to_kg_per_ha(value, uom):
    """Fertiliser/pesticide application rate -> kg (or litres) per hectare.

    Litres are carried through 1:1 as kg -- an approximation that is flagged as
    'unit_suspect' rather than silently corrected, because the true density of
    the product is unknown.
    """
    v = num(value)
    if v is None:
        return None
    u = (text(uom) or "").lower()
    mult = 1.0
    if "tonne" in u:
        mult *= 1000.0
    if "acre" in u:
        mult *= PER_ACRE_PER_HA
    return round(v * mult, 4)


def weight_to_kg(value, uom):
    v = num(value)
    if v is None:
        return None
    u = (text(uom) or "").lower()
    if u.startswith("tonne"):
        return round(v * 1000.0, 4)
    return round(v, 4)


def volume_to_m3(value, uom):
    v = num(value)
    if v is None:
        return None
    u = (text(uom) or "").lower()
    if "litre" in u:
        return round(v / 1000.0, 6)
    return round(v, 6)  # already cubic metres


def parse_npk(fert_type):
    """Pull N / P2O5 / K2O percentages out of a fertiliser_type label.

    'Cattle manure - 0.6% N'                                  -> (0.6, None, None)
    'Compound NPK - 15% N / 15% K2O / 15% P2O5'                -> (15, 15, 15)
    'Ammonium sulphate nitrate - 26%N'                         -> (26, None, None)
    'Limestone - 55% CaCO3 / 29%CaO'                           -> (None, None, None)
    """
    s = text(fert_type) or ""
    # (?![A-Za-z]) stops '% N' matching the N inside e.g. '%Na'
    n = re.search(r"([\d.]+)\s*%\s*N(?![A-Za-z0-9])", s)
    p = re.search(r"([\d.]+)\s*%\s*P2O5", s, re.I)
    k = re.search(r"([\d.]+)\s*%\s*K2O", s, re.I)
    f = lambda m: float(m.group(1)) if m else None
    return f(n), f(p), f(k)


def is_organic_fert(fert_type):
    s = (text(fert_type) or "").lower()
    if not s:
        return None
    return any(tok in s for tok in ORGANIC_TOKENS)


def clean_shade_type(v):
    """'Torpical ...' -> 'Tropical ...' (413 instances, a fixed form typo)."""
    s = text(v)
    return s.replace("Torpical", "Tropical") if s else None


def clean_crop_type(v):
    s = text(v)
    return s.replace("_", " ") if s else None


def clean_enumerator(v):
    s = text(v)
    if not s:
        return None
    return " ".join(w.capitalize() for w in s.split())


def age_band(age):
    if age is None:
        return None
    for hi, lbl in ((25, "<25"), (35, "25-34"), (45, "35-44"),
                    (55, "45-54"), (65, "55-64")):
        if age < hi:
            return lbl
    return "65+"


def crop_age_band(a):
    if a is None:
        return None
    for hi, lbl in ((4, "0-3"), (11, "4-10"), (21, "11-20"), (31, "21-30")):
        if a < hi:
            return lbl
    return "31+"


def parse_gps(v):
    """'lat lon alt precision' -> (lat, lon, alt, precision)."""
    parts = (text(v) or "").split()
    if len(parts) < 2:
        return None, None, None, None
    out = []
    for i in range(4):
        out.append(num(parts[i]) if i < len(parts) else None)
    return tuple(out)


def offset_or_calendar(raw, assessment_year):
    """Some enumerators typed a calendar year where a year-offset was wanted.

    p95 of pruning_start_year is 2031 and max 2053, against a median of 3.
    Anything > 1900 is reinterpreted as a calendar year and converted back to
    an offset; results outside 0..30 are discarded rather than guessed at.
    """
    v = integer(raw)
    if v is None:
        return None
    if v > 1900:
        if not assessment_year:
            return None
        v = v - assessment_year
    return v if 0 <= v <= 30 else None


def repeat_rows(row, repeat_name):
    """Repeat instances, with the 'repeat/field' prefix stripped from keys."""
    items = row.get(repeat_name)
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        out.append({k.split("/")[-1].split("__")[-1]: v for k, v in it.items()})
    return out


# --- main transform ---------------------------------------------------
def transform_submission(row):
    """Return dict(parent=..., children={table: [rows]}, flags=[...]).

    `parent` carries no submission_id -- the loader assigns it on upsert and
    then stamps it onto the child rows.
    """
    g = lambda grp, f: get(row, grp, f)
    flags = []

    def flag(code, severity, field=None, detail=None):
        flags.append({"code": code, "severity": severity,
                      "field": field, "detail": detail})

    assessment_year = integer(g("crop_details", "assessment_year"))
    birth_year = integer(g("general_information", "birth_year"))
    age = (assessment_year - birth_year) if (assessment_year and birth_year) else None

    lat, lon, alt, prec = parse_gps(g("general_information", "registration_gps"))

    crop_type = clean_crop_type(g("crop_details", "crop_type"))
    ct = (crop_type or "").lower()
    crop_species = "coffee" if "coffee" in ct else ("cocoa" if "cocoa" in ct else None)
    crop_system = "shaded" if "shaded" in ct else ("monocrop" if "monocrop" in ct else None)

    area_ha = area_to_ha(g("crop_details", "growing_area"),
                         g("crop_details", "growing_area_uom"))
    total_yield_t = num(g("crop_yield", "total_yield_assessment_year"))
    yield_t_per_ha = (round(total_yield_t / area_ha, 4)
                      if (total_yield_t is not None and area_ha) else None)

    literacy = text(g("general_information", "literacy_level"))
    primary_or_less = (literacy in ("no_formal_education", "primary_incomplete",
                                    "primary_complete")) if literacy else None

    submitted_at = text(row.get("_submission_time"))

    parent = {
        "kobo_id": integer(row.get("_id")),
        "kobo_uuid": text(row.get("_uuid")),
        "form_version": text(row.get("__version__")),
        "submitted_at": submitted_at,
        "submission_month": (submitted_at[:7] + "-01") if submitted_at else None,

        "country": text(g("general_information", "admin_level_0")),
        "region": text(g("general_information", "admin_level_1")),
        "district": text(g("general_information", "admin_level_2")),
        "subcounty_raw": text(g("general_information", "admin_level_3")),
        "village_raw": text(g("general_information", "village")),
        "latitude": lat, "longitude": lon,
        "gps_altitude_m": alt, "gps_precision_m": prec,

        "project": text(g("general_information", "project")),
        "enumerator": clean_enumerator(g("conclusion", "enumerator_name")),

        "birth_year": birth_year,
        "age_years": age,
        "age_band": age_band(age),
        "is_youth": (age < 35) if age is not None else None,
        "gender": text(g("general_information", "gender")),
        "literacy_level": literacy,
        "literacy_is_primary_or_less": primary_or_less,
        "household_size": integer(g("general_information", "household_size")),
        "disability": boolean(g("general_information", "disability")),
        "disability_form": text(g("general_information", "disability_form")),
        "access_to_mobile_device": boolean(g("general_information", "access_to_mobile_device")),
        "mobile_device_type": text(g("general_information", "mobile_device_type")),
        "access_to_internet": boolean(g("general_information", "access_to_internet_3_mnths")),
        "language": text(g("general_information", "language")),
        "cooperative_member": boolean(g("general_information", "cooperative_membership")),
        "cooperative_name_raw": text(g("general_information", "cooperative_name")),

        "crop_type": crop_type,
        "crop_species": crop_species,
        "crop_system": crop_system,
        "is_shaded": (crop_system == "shaded") if crop_system else None,
        "soil_type": text(g("crop_details", "soil_type")),
        "expected_lifecycle_years": integer(g("crop_details", "expected_lifecycle_years")),
        "assessment_year": assessment_year,
        "crop_age": integer(g("crop_details", "crop_age")),
        "crop_age_band": crop_age_band(integer(g("crop_details", "crop_age"))),
        "growing_area_raw": num(g("crop_details", "growing_area")),
        "growing_area_uom": text(g("crop_details", "growing_area_uom")),
        "area_ha": area_ha,
        "dead_plants_perc": num(g("crop_details", "dead_plants_perc")),
        "dead_plants_replaced": boolean(g("crop_details", "dead_plants_replaced")),
        "plants_per_area_raw": integer(g("crop_details", "no_plants_per_area")),
        "plants_per_area_uom": text(g("crop_details", "no_plants_per_area_uom")),
        "plants_per_ha": per_area_to_per_ha(g("crop_details", "no_plants_per_area"),
                                            g("crop_details", "no_plants_per_area_uom")),

        "total_yield_t": total_yield_t,
        "yield_t_per_ha": yield_t_per_ha,
        "waste_fruit_perc": num(g("crop_residues", "waste_fuit_perc")),  # sic

        "pruning_option": text(g("crop_residues_pruning", "pruning_option")),
        "pruning_constant_val": num(g("crop_residues_pruning", "pruning_constant_pruning_val")),
        "pruning_start_year_raw": integer(g("crop_residues_pruning", "pruning_constant_pruning_start_year")),
        "pruning_start_year_offset": offset_or_calendar(
            g("crop_residues_pruning", "pruning_constant_pruning_start_year"), assessment_year),

        "pesticide_applied": boolean(g("pesticide", "pesticide_applied_exist")),
        "fertilizer_applied": boolean(g("fertilizer_into", "fertilizer_applied_exist")),
        "fuel_energy_used": boolean(g("fuel_energy_into", "fuel_energy_applied_exist")),
        "irrigation_used": boolean(g("irrigation_energy_into", "irrigation_energy_applied_exist")),
        "wastewater_treated": boolean(g("waste_water", "waste_water_treatment_exist")),
        "intercrop_exists": boolean(g("non_crps_est", "intercrop_exist")),
        "shade_trees_exist": boolean(g("non_crps_est", "shade_trees_exist")),
        "hedges_exist": boolean(g("non_crps_est", "hedges_exist")),
        "land_use_change_exists": boolean(g("soil_carbon_into", "land_use_change_exist")),

        "forest_change": text(g("re_deforestation", "forest_change")),
        "forest_type": text(g("re_deforestation", "forest_type")),
        "forest_removed_age": integer(g("re_deforestation", "de_forest_removed_age")),
        "final_year_pruning_perc": num(g("re_deforestation", "de_final_year_pruning_perc")),
        "de_area_raw": num(g("re_deforestation", "de_area_re_deforested")),
        "de_area_uom": text(g("re_deforestation", "de_area_re_deforested_uom")),
        "de_area_ha": area_to_ha(g("re_deforestation", "de_area_re_deforested"),
                                 g("re_deforestation", "de_area_re_deforested_uom")),
    }

    children = {}

    # ---- residue fates (wide -> long) --------------------------------
    residues, burn_vals = [], []
    for stream in RESIDUE_STREAMS:
        present, total = False, 0.0
        for fate in RESIDUE_FATES:
            v = num(g("crop_residues", f"{stream}_{fate}"))
            if v is None:
                continue
            present, total = True, total + v
            residues.append({"stream": stream, "fate": fate, "pct": v})
            if fate == "burn" and stream in BURN_STREAMS:
                burn_vals.append(v)
        if present and abs(total - 100) > 0.01:
            flag("residue_split_not_100", "warning", f"crop_residues.{stream}",
                 f"fates sum to {total:g}")
    children["cfp_residue_fates"] = residues
    parent["residue_burn_share"] = (round(sum(burn_vals) / len(burn_vals), 4)
                                    if burn_vals else None)

    # ---- yield curve (wide -> long) ----------------------------------
    curve = []
    for i in range(31):
        pct = num(g("crop_yield", f"yield_est_year_{i}"))
        if pct is None:
            continue
        curve.append({"year_offset": i,
                      "calendar_year": integer(g("crop_details", f"year_{i}_label")),
                      "pct_of_peak": pct})
    children["cfp_yield_curve"] = curve

    # ---- fertiliser --------------------------------------------------
    fert, n_load, p_load, k_load, organic_hits = [], 0.0, 0.0, 0.0, 0
    for i, it in enumerate(repeat_rows(row, "fertilizer_application"), start=1):
        ftype = text(it.get("fertiliser_type"))
        n_pct, p_pct, k_pct = parse_npk(ftype)
        rate_kg_ha = rate_to_kg_per_ha(it.get("fertiliser_application_rate"),
                                       it.get("fertiliser_application_rate_uom"))
        n_kg_ha = (round(rate_kg_ha * n_pct / 100.0, 4)
                   if (rate_kg_ha is not None and n_pct is not None) else None)
        org = is_organic_fert(ftype)
        if org:
            organic_hits += 1
        uom = (text(it.get("fertiliser_application_rate_uom")) or "").lower()
        if "tonne" in uom and "acre" in uom:
            flag("unit_suspect", "warning", "fertiliser_application_rate_uom",
                 "tonnes per acre -- implausible at the observed median")
        if rate_kg_ha is not None and rate_kg_ha > 5000:
            flag("out_of_range", "error", "fertiliser_application_rate",
                 f"{rate_kg_ha:g} kg/ha")
        if "litre" in uom:
            flag("unit_suspect", "info", "fertiliser_application_rate_uom",
                 "litres treated 1:1 as kg (product density unknown)")
        fert.append({
            "seq": i,
            "category": text(it.get("fertilizer_category")),
            "fertiliser_type": ftype,
            "is_organic": org,
            "prod_region": text(it.get("fertiliser_prod_region")),
            "rate_raw": num(it.get("fertiliser_application_rate")),
            "rate_uom": text(it.get("fertiliser_application_rate_uom")),
            "rate_kg_per_ha": rate_kg_ha,
            "n_pct": n_pct, "p2o5_pct": p_pct, "k2o_pct": k_pct,
            "n_kg_per_ha": n_kg_ha,
            "n_ammonium_pct": num(it.get("fertiliser_n_ammonium")),
            "n_nitrate_pct": num(it.get("fertiliser_n_nitrate")),
            "n_urea_pct": num(it.get("fertiliser_n_urea")),
            "explicit_p2o5_pct": num(it.get("fertiliser_p205")),
            "explicit_k2o_pct": num(it.get("fertiliser_n_k20")),
            "n_other_pct": num(it.get("fertiliser_n_other")),
        })
        n_load += n_kg_ha or 0.0
        if rate_kg_ha and p_pct:
            p_load += rate_kg_ha * p_pct / 100.0
        if rate_kg_ha and k_pct:
            k_load += rate_kg_ha * k_pct / 100.0
    children["cfp_fertilizer_applications"] = fert
    parent["n_kg_per_ha"] = round(n_load, 4) if fert else None
    parent["p2o5_kg_per_ha"] = round(p_load, 4) if fert else None
    parent["k2o_kg_per_ha"] = round(k_load, 4) if fert else None
    parent["organic_fert_share"] = round(organic_hits / len(fert), 4) if fert else None

    # ---- pesticide ---------------------------------------------------
    pest, ai_load = [], 0.0
    for i, it in enumerate(repeat_rows(row, "pesticide_application"), start=1):
        ai_pct = num(it.get("active_ingredient"))
        field_pct = num(it.get("perc_field_applied"))
        rate_ha = rate_to_kg_per_ha(it.get("application_rate"),
                                    it.get("application_rate_uom"))
        ai_kg_ha = None
        if rate_ha is not None and ai_pct is not None:
            ai_kg_ha = round(rate_ha * (ai_pct / 100.0)
                             * ((field_pct if field_pct is not None else 100) / 100.0), 5)
        if ai_pct is not None and ai_pct > 100:
            flag("out_of_range", "error", "active_ingredient",
                 f"{ai_pct:g}% active ingredient")
        pest.append({
            "seq": i,
            "category": text(it.get("pesticide_category")),
            "pesticide_type": text(it.get("pesticide_type")),
            "perc_field_applied": field_pct,
            "active_ingredient_pct": ai_pct,
            "rate_raw": num(it.get("application_rate")),
            "rate_uom": text(it.get("application_rate_uom")),
            "rate_per_ha": rate_ha,
            "ai_kg_per_ha": ai_kg_ha,
        })
        ai_load += ai_kg_ha or 0.0
    children["cfp_pesticide_applications"] = pest
    parent["ai_kg_per_ha"] = round(ai_load, 5) if pest else None

    # ---- energy ------------------------------------------------------
    energy, litres = [], 0.0
    for i, it in enumerate(repeat_rows(row, "fuel_energy_use"), start=1):
        amt = num(it.get("energy_amount"))
        uom = text(it.get("energy_uom"))
        as_litres = amt if (uom or "").lower().startswith("litre") else None
        cats = (text(it.get("energy_use_category")) or "").split()
        energy.append({
            "seq": i,
            "measurement_method": text(it.get("energy_measurement_method")),
            "energy_source": text(it.get("energy_source")),
            "amount_raw": amt, "amount_uom": uom, "amount_litres": as_litres,
            "use_categories": cats or None,
        })
        litres += as_litres or 0.0
    children["cfp_energy_use"] = energy
    parent["energy_litres"] = round(litres, 4) if energy else None

    # ---- irrigation --------------------------------------------------
    irr, water = [], 0.0
    for i, it in enumerate(repeat_rows(row, "irrigation_energy_use"), start=1):
        m3 = volume_to_m3(it.get("irrigation_water_added"),
                          it.get("irrigation_water_added_uom"))
        irr.append({
            "seq": i,
            "irrigation_method": text(it.get("irrigation_method")),
            "water_source": text(it.get("irrigation_water_source")),
            "power_source": text(it.get("irrigation_power_source")),
            "perc_field_irrigated": num(it.get("perc_field_irrigated")),
            "water_added_raw": num(it.get("irrigation_water_added")),
            "water_added_uom": text(it.get("irrigation_water_added_uom")),
            "water_added_m3": m3,
        })
        water += m3 or 0.0
    children["cfp_irrigation_use"] = irr
    parent["irrigation_water_m3"] = round(water, 6) if irr else None

    # ---- transport ---------------------------------------------------
    trans, tkm = [], 0.0
    for i, it in enumerate(repeat_rows(row, "transport_use"), start=1):
        kg = weight_to_kg(it.get("transport_weight"), it.get("transport_weight_uom"))
        km = num(it.get("transport_distance_km"))
        row_tkm = (round(kg / 1000.0 * km, 5)
                   if (kg is not None and km is not None) else None)
        if kg is not None and kg > 20000:
            flag("magnitude_outlier", "warning", "transport_weight", f"{kg:g} kg")
        trans.append({
            "seq": i,
            "transport_type": text(it.get("transport_type")),
            "boundary": text(it.get("transport_boundary")),
            "weight_raw": num(it.get("transport_weight")),
            "weight_uom": text(it.get("transport_weight_uom")),
            "weight_kg": kg, "distance_km": km, "tonne_km": row_tkm,
        })
        tkm += row_tkm or 0.0
    children["cfp_transport_use"] = trans
    parent["tonne_km"] = round(tkm, 5) if trans else None

    # ---- intercrops / shade trees / hedges ---------------------------
    inter, inter_cover = [], 0.0
    for i, it in enumerate(repeat_rows(row, "intercrop"), start=1):
        cov = num(it.get("intercrop_perc"))
        inter.append({
            "seq": i,
            "intercrop_type": text(it.get("intercrop_type")),
            "cover_perc": cov,
            "density_raw": num(it.get("intercrop_planting_density")),
            "density_uom": text(it.get("intercrop_planting_density_uom")),
            "density_per_ha": per_area_to_per_ha(
                it.get("intercrop_planting_density"),
                it.get("intercrop_planting_density_uom")),
        })
        inter_cover += cov or 0.0
    children["cfp_intercrops"] = inter
    parent["intercrop_cover_perc"] = round(inter_cover, 4) if inter else None

    shade, shade_cover = [], 0.0
    for i, it in enumerate(repeat_rows(row, "shade_tress"), start=1):
        cov = num(it.get("shade_tress_perc"))
        shade.append({
            "seq": i,
            "shade_type_raw": text(it.get("shade_tress_type")),
            "shade_type": clean_shade_type(it.get("shade_tress_type")),
            "cover_perc": cov,
            "density_raw": num(it.get("shade_tress_planting_density")),
            "density_uom": text(it.get("shade_tress_planting_density_uom")),
            "density_per_ha": per_area_to_per_ha(
                it.get("shade_tress_planting_density"),
                it.get("shade_tress_planting_density_uom")),
        })
        shade_cover += cov or 0.0
    children["cfp_shade_trees"] = shade
    parent["shade_cover_perc"] = round(shade_cover, 4) if shade else None

    hedges, hedge_area = [], 0.0
    for i, it in enumerate(repeat_rows(row, "hedge"), start=1):
        w, ln = num(it.get("hedge_width")), num(it.get("hedge_lenght"))  # sic
        area = round(w * ln, 4) if (w is not None and ln is not None) else None
        if w is not None and w > 10:
            flag("out_of_range", "warning", "hedge_width",
                 f"{w:g} m -- implausible for a hedge")
        hedges.append({"seq": i, "hedge_type": text(it.get("hedge_type")),
                       "width_m": w, "length_m": ln, "area_m2": area})
        hedge_area += area or 0.0
    children["cfp_hedges"] = hedges
    parent["hedge_area_m2"] = round(hedge_area, 4) if hedges else None

    # ---- wastewater --------------------------------------------------
    ww = []
    for i, it in enumerate(repeat_rows(row, "waste_water_treatments"), start=1):
        vol = num(it.get("waste_water_volume"))
        vuom = text(it.get("waste_water_volume_uom"))
        ww.append({
            "seq": i,
            "oxygen_demand_type": text(it.get("oxygen_demand_type")),
            "treatment_process": text(it.get("treatment_process")),
            "volume_raw": vol, "volume_uom": vuom,
            "volume_litres": (vol if (vuom or "").lower().startswith("litre")
                              else (vol * 1000 if vol is not None else None)),
            "oxygen_demand": num(it.get("oxygen_demand")),
            "oxygen_demand_uom": text(it.get("oxygen_demand_uom")),
        })
    children["cfp_wastewater_treatments"] = ww

    # ---- land use change ---------------------------------------------
    luc = []
    for i, it in enumerate(repeat_rows(row, "soil_carbon_change"), start=1):
        yr_raw = integer(it.get("land_use_change_year"))
        yr = yr_raw if (yr_raw and yr_raw > 1900) else None
        if yr_raw is not None and yr is None:
            flag("calendar_in_offset", "warning", "land_use_change_year",
                 f"{yr_raw} is not a usable calendar year")
        luc.append({
            "seq": i,
            "change_year_raw": yr_raw, "change_year": yr,
            "previous_use": text(it.get("land_use_change_previous")),
            "new_use": text(it.get("land_use_change_new")),
            "change_perc": num(it.get("land_use_change_perc")),
        })
    children["cfp_land_use_change"] = luc

    # ---- cross-cutting DQ checks -------------------------------------
    for fl, tbl, label in (
        ("pesticide_applied", "cfp_pesticide_applications", "pesticide"),
        ("fertilizer_applied", "cfp_fertilizer_applications", "fertiliser"),
        ("fuel_energy_used", "cfp_energy_use", "fuel/energy"),
        ("irrigation_used", "cfp_irrigation_use", "irrigation"),
        ("intercrop_exists", "cfp_intercrops", "intercrop"),
        ("shade_trees_exist", "cfp_shade_trees", "shade trees"),
        ("hedges_exist", "cfp_hedges", "hedges"),
        ("land_use_change_exists", "cfp_land_use_change", "land-use change"),
        ("wastewater_treated", "cfp_wastewater_treatments", "wastewater"),
    ):
        if parent.get(fl) is True and not children.get(tbl):
            flag("yes_but_empty", "warning", fl,
                 f"reported {label} but recorded no detail rows")

    lc = parent["expected_lifecycle_years"]
    if lc is not None and (lc > 100 or lc < 5):
        flag("out_of_range", "error", "expected_lifecycle_years", str(lc))
    elif lc is not None and lc > 30:
        flag("lifecycle_truncated", "info", "expected_lifecycle_years",
             f"{lc} yrs but the curve only holds 31 years")

    if parent["pruning_start_year_raw"] and parent["pruning_start_year_raw"] > 1900:
        flag("calendar_in_offset", "warning", "pruning_constant_pruning_start_year",
             f"{parent['pruning_start_year_raw']} looks like a calendar year")
    if parent["pruning_constant_val"] is not None and parent["pruning_constant_val"] > 100:
        flag("out_of_range", "error", "pruning_constant_pruning_val",
             str(parent["pruning_constant_val"]))
    if parent["final_year_pruning_perc"] is not None and parent["final_year_pruning_perc"] > 100:
        flag("out_of_range", "error", "de_final_year_pruning_perc",
             str(parent["final_year_pruning_perc"]))
    if parent["dead_plants_perc"] is not None and parent["dead_plants_perc"] > 100:
        flag("out_of_range", "error", "dead_plants_perc", str(parent["dead_plants_perc"]))
    if birth_year is not None and not (1920 <= birth_year <= 2010):
        flag("out_of_range", "warning", "birth_year", str(birth_year))
    if total_yield_t is not None and total_yield_t > 500:
        flag("magnitude_outlier", "warning", "total_yield_assessment_year",
             f"{total_yield_t:g} t")
    if area_ha is not None and area_ha > 20:
        flag("magnitude_outlier", "warning", "growing_area", f"{area_ha:g} ha")
    if lat is None or lon is None:
        flag("missing_gps", "error", "registration_gps", "no coordinates")
    if (parent["crop_age"] or 0) > 3 and curve and curve[0]["pct_of_peak"] == 0:
        flag("yield_curve_template", "info", "crop_yield",
             "mature crop but year-0 yield is 0 -- generic lifecycle template")

    return {"parent": parent, "children": children, "flags": flags}
