"""
Climate Vulnerability Assessment (CVA) — canonical transform.

Reads raw Kobo JSON (cva_raw.json + cva_formdef.json) and produces the clean,
normalized record sets consumed by BOTH the Supabase loader and the dashboard
builder, so the two can never diverge:

    households        -> cva_households            (one row per submission)
    hazard_exposure   -> cva_hazard_exposure       (one row per hh x hazard)
    impacts           -> cva_impacts               (one row per hh x impact)
    capacity_ind      -> cva_capacity_indicators   (one row per submission)
    capacity_sources  -> cva_capacity_sources      (one row per hh x source)
    adaptation        -> cva_adaptation_practices  (one row per hh x practice)

DEFENSIVE cleaning is baked in here (DQ handled in the pipeline, not at source):
  * version-robust field access (pick) — columns are group-prefixed and the form
    evolved across versions (main_crop -> farmer_main_crop, frost_level, etc.).
  * choice codes decoded to labels from the CURRENT form definition; retired
    legacy codes fall back to a humanized label and are flagged.
  * GPS validated against the country bounding box; gps_missing / out_of_bounds.
  * field_size normalized to hectares; age derived and range-checked.
  * duplicate farmer_id flagged; per-row dq_flags surfaced, never dropped.

Composite scores (approved methodology — severity x frequency):
  * hazard_exposure_score = 100 * sum(severity_wt * frequency_wt) / 90   [0..100]
        (10 hazards x max 3x3 = 90 theoretical maximum; stable & reproducible)
  * adaptive_capacity_score = 100 * (# positive capacity indicators) / (# answered)
  * priority_flag = exposure >= country-median AND capacity <= country-median
"""
import os, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("CVA_DATA_DIR", os.path.join(HERE, "data"))
FORM_UID = os.environ.get("CVA_FORM_UID", "aGSsfgrUoJzgLM4aLfPXoj")

# Country bounding boxes (lat_min,lat_max, lon_min,lon_max) keyed by country label.
BOUNDS = {
    "Kenya":    dict(lat=(-4.8, 5.2),  lon=(33.8, 42.0)),
    "Uganda":   dict(lat=(-1.6, 4.3),  lon=(29.4, 35.2)),
    "Ethiopia": dict(lat=(3.3, 15.0),  lon=(32.9, 48.0)),
    "Tanzania": dict(lat=(-11.8, -0.9),lon=(29.3, 40.5)),
}
# field-size unit -> hectares
UNIT_HA = {"hectares": 1.0, "acres": 0.404686, "lima": 0.101171, "square_meters": 0.0001}

SEV_WT  = {"high": 3, "medium": 2, "low": 1}
FREQ_WT = {"low_1": 1, "low": 1, "medium": 2, "high": 3}

# hazard code -> (severity field name, frequency field name). Field names are the
# survey question names; pick() matches them as group-prefixed data-column suffixes.
HAZARDS = {
    "river_flood":      ("level_river_flood",      "river_flood_frequency"),
    "changing_seasons": ("level_changing_seasons", "changing_seasons_frequency"),
    "hail_storms":      ("level_hail_storms",      "hailstorms_frequency"),
    "landslide":        ("level_landslide",        "landslide_frequency"),
    "cyclone":          ("level_cyclone",          "cyclone_frequency"),
    "water_scarcity":   ("level_water_scarcity",   "water_scarcity_frequency"),
    "extreme_heat":     ("level_extreme_heat",     "extreme_heat_frequency"),
    "wildfire":         ("level_wildfire",         "wildfire_frequency"),
    "extreme_cold":     ("frost_level",            "frost_frequency"),   # data col; form name is level_frost
    "excess_rainfall":  ("level_excess_rainfall",  "excess_rainfall_frequency"),
}

# impact select_multiple field -> category key
IMPACT_FIELDS = {
    "production": "production",
    "harvest_storage_processing": "harvest",
    "produce_marketing": "marketing",
    "social_aspects": "social",
}

# capacity scalar (yes/no) field -> output column
CAP_BOOL = {
    "crop_suitable": "crop_suitable",
    "more_than_one_crop": "grows_multiple_crops",
    "part_of_group_cooperative": "group_member",
    "use_extension_services": "uses_extension",
    "use_financial_services": "uses_financial",
    "completed_higher_education": "higher_education",
    "use_equipment_and_machinery": "uses_equipment",
    "have_crop_insurance_cover": "has_insurance",
    "do_you_have_surplus_crops": "has_surplus",
    "do_you_sell_surplus": "sells_surplus",
    "use_shared_knowledge_info": "shares_knowledge",
    "access_weather_climate_info": "weather_access",
    "part_of_seed_testing_programs": "in_seed_testing",
    "receive_crop_market_trends": "receives_market_trends",
    "reinvest_crop_income": "reinvests",
    "have_access_to_mobile_internet": "mobile_internet",
}
# indicators that count toward the adaptive-capacity score (positive = capability)
CAP_SCORE_KEYS = ["grows_multiple_crops", "group_member", "uses_extension", "uses_financial",
                  "higher_education", "uses_equipment", "has_insurance", "has_surplus",
                  "sells_surplus", "shares_knowledge", "weather_access", "in_seed_testing",
                  "receives_market_trends", "reinvests", "mobile_internet"]

# capacity multiselect field -> indicator key
CAP_SOURCES = {
    "extension_services": "extension",
    "financial_services": "financial",
    "weather_alerts_platforms": "weather",
    "knowledge_platforms_select": "knowledge",
    "reinvest_activities": "reinvest",
}

# adaptation domain label -> (gate yes/no field, practices multiselect field)
DOMAINS = [
    ("Water management",          "water_management",           "water_management_practices"),
    ("Soil water management",     "soil_water_management",      "soil_water_management_practice"),
    ("Soil fertility management", "soil_fertility_management",  "soil_fertility_practices"),
    ("Plant material",            "plant_material",             "plant_material_practices"),
    ("Pest & disease management", "pest_disease_management",    "pest_management_practices"),
    ("Waste management",          "waste_management",           "waste_management_practices"),
    ("Storage",                   "storage",                    "storage_practices"),
    ("Natural resource mgmt",     "natural_resource_management","resource_management_practices"),
    ("Diversification",           "diversification",            "diversification_practices"),
    ("Marketing",                 "marketing",                  "marketing_practices"),
]

# ---------------------------------------------------------------- helpers
def pick(d, fn):
    """Version-robust field access. Kobo prefixes fields with the group path
    joined by '__' (hazards_group__level_river_flood). Match on the group- or
    repeat-separated suffix, not a naive split (field names contain '__' too)."""
    if fn in d:
        return d[fn]
    s1, s2 = "__" + fn, "/" + fn
    for k, v in d.items():
        if k.endswith(s1) or k.endswith(s2):
            return v
    return None

def pick_first(d, *names):
    for n in names:
        v = pick(d, n)
        if v not in (None, ""):
            return v
    return None

def _s(v):
    return v.strip() if isinstance(v, str) and v.strip() else None

def _num(v):
    try:
        if v in (None, ""):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None

def _int(v):
    n = _num(v)
    return int(n) if n is not None else None

def humanize(code):
    return code.replace("_", " ").strip().capitalize() if isinstance(code, str) else code

def geo_split(s):
    """Kobo gps_location is 'lat lon altitude accuracy'. Returns (lat, lon, alt);
    a 0/negative altitude means the device did not capture it -> None."""
    if not isinstance(s, str) or not s.strip():
        return (None, None, None)
    p = s.split()
    try:
        lat, lon = float(p[0]), float(p[1])
    except Exception:
        return (None, None, None)
    alt = None
    if len(p) >= 3:
        try:
            a = float(p[2])
            alt = a if a > 0 else None
        except (TypeError, ValueError):
            alt = None
    return (lat, lon, alt)

def in_bounds(lat, lon, country):
    b = BOUNDS.get(country)
    if not b or lat is None or lon is None:
        return None
    return bool(b["lat"][0] <= lat <= b["lat"][1] and b["lon"][0] <= lon <= b["lon"][1])

def country_from_gps(lat, lon):
    """Legacy (2023) rows predate the admin_level_0 field. Recover country by
    point-in-bounding-box so coverage/hazard/capacity views still classify them."""
    if lat is None or lon is None:
        return None
    for name, b in BOUNDS.items():
        if b["lat"][0] <= lat <= b["lat"][1] and b["lon"][0] <= lon <= b["lon"][1]:
            return name
    return None

def year_of(iso):
    if not iso:
        return None
    try:
        return int(str(iso)[:4])
    except Exception:
        return None

# ---------------------------------------------------------------- decoder
def build_decoder(formdef):
    """Return (decode, is_known). decode(field,val,multi) maps choice code(s) to
    label(s) using the CURRENT form definition; is_known(field,code) tells whether
    a code exists in the current choice list (retired legacy codes -> False)."""
    lists = {}
    for ch in formdef.get("choices", []):
        lab = ch.get("label")
        lab = lab[0] if isinstance(lab, list) and lab else lab
        lists.setdefault(ch["list_name"], {})[ch["name"]] = lab or humanize(ch["name"])
    field_list = {r["name"]: r["select_from_list_name"] for r in formdef.get("survey", [])
                  if r.get("name") and r.get("select_from_list_name")}

    def decode(field, val, multi=False):
        if not isinstance(val, str) or not val:
            return val
        m = lists.get(field_list.get(field), {})
        if multi:
            return [(c, m.get(c, humanize(c))) for c in val.split()]
        return m.get(val, humanize(val))

    def is_known(field, code):
        return code in lists.get(field_list.get(field), {})

    return decode, is_known

def yesno(val):
    if isinstance(val, str):
        v = val.strip().lower()
        if v in ("yes", "1", "true"):
            return True
        if v in ("no", "0", "false"):
            return False
    return None

# ================================================================= indices
# Weighted Adaptive Capacity Index (ACI), Hazard Exposure Index (HEI = the
# household hazard_exposure_score, reused unchanged), Vulnerability Index (VI)
# and a fixed-threshold 4-quadrant classification. These are computed at BUILD
# time (dashboard + per-farmer CSV) from the canonical transform outputs; they
# are intentionally NOT written into the household dict the Supabase loader
# upserts, so the existing cva_* schema and nightly load stay untouched.
#
#   ACI (0-100) = 100 * Σ(weight_i * frac_i) / Σ(weight_i)   over sub-dimensions
#                 with ≥1 applicable (answered) field; frac_i = positives/applicable.
#     institutional&social (20): group_member, shares_knowledge (+richness bonus
#                                for # knowledge platforms, capped at 5)
#     financial            (20): uses_financial, has_insurance, reinvests
#     information access   (25): uses_extension, weather_access, receives_market_trends,
#                                education (scaled by tier, not flat yes/no)
#     technical/physical   (20): uses_equipment, in_seed_testing, mobile_internet
#     market resilience    (15): crop_suitable, (has_surplus AND sells_surplus),
#                                grows_multiple_crops
#   VI (0-100)  = 0.5 * HEI + 0.5 * (100 - ACI)
#   quadrant    = Critical (HEI≥50 & ACI<50) | Stressed (HEI≥50 & ACI≥50)
#               | Latent risk (HEI<50 & ACI<50) | Stable (HEI<50 & ACI≥50)
EDU_TIER = {"Primary Level": 1.0 / 3, "Secondary Level": 2.0 / 3, "Tertiary Level": 1.0}

ACI_SUBDIMS = ["institutional", "financial", "information", "technical", "market"]

def _b(v):
    """bool -> 0.0/1.0; None (unanswered / not applicable) stays None."""
    return None if v is None else (1.0 if v else 0.0)

def _frac(vals):
    """Mean of the applicable (non-None) values; None if none applicable."""
    xs = [v for v in vals if v is not None]
    return (sum(xs) / len(xs)) if xs else None

def compute_indices(cap, knowledge_count, hei):
    """cap: a capacity_ind row (dict of decoded booleans + education_level).
    knowledge_count: # of knowledge_platforms_select the household selected.
    hei: the household hazard_exposure_score (0-100). Returns aci/vi/quadrant
    plus the five sub-dimension fractions (0-1, or None if not applicable)."""
    # institutional & social capital
    base = _frac([_b(cap.get("group_member")), _b(cap.get("shares_knowledge"))])
    inst = None
    if base is not None:
        bonus = 0.2 * min(knowledge_count or 0, 5) / 5.0 if cap.get("shares_knowledge") else 0.0
        inst = min(1.0, base + bonus)
    # financial capacity
    fin = _frac([_b(cap.get("uses_financial")), _b(cap.get("has_insurance")), _b(cap.get("reinvests"))])
    # information access (education scaled by tier)
    he = cap.get("higher_education")
    if he is None:
        edu = None
    elif he:
        edu = EDU_TIER.get(cap.get("education_level"), 1.0)
    else:
        edu = 0.0
    info = _frac([_b(cap.get("uses_extension")), _b(cap.get("weather_access")),
                  _b(cap.get("receives_market_trends")), edu])
    # technical / physical capacity
    tech = _frac([_b(cap.get("uses_equipment")), _b(cap.get("in_seed_testing")),
                  _b(cap.get("mobile_internet"))])
    # market resilience — surplus counts only if it is actually sold
    hs, ss = cap.get("has_surplus"), cap.get("sells_surplus")
    if hs is None:
        surplus = None
    elif not hs:
        surplus = 0.0
    else:
        surplus = _b(ss) if ss is not None else 0.0
    mkt = _frac([_b(cap.get("crop_suitable")), surplus, _b(cap.get("grows_multiple_crops"))])

    subs = list(zip(ACI_SUBDIMS, [20, 20, 25, 20, 15], [inst, fin, info, tech, mkt]))
    num = sum(w * f for _, w, f in subs if f is not None)
    den = sum(w for _, w, f in subs if f is not None)
    aci = round(100.0 * num / den, 1) if den else None
    vi = round(0.5 * hei + 0.5 * (100.0 - aci), 1) if aci is not None else None
    if aci is None:
        quad = None
    else:
        hi, lc = hei >= 50, aci < 50
        quad = ("Critical" if (hi and lc) else "Stressed" if (hi and not lc)
                else "Latent risk" if (not hi and lc) else "Stable")
    return dict(aci=aci, vi=vi, quadrant=quad,
                sub={k: (round(f, 4) if f is not None else None) for k, _, f in subs})

def enrich_indices(data):
    """Build a {kobo_id: compute_indices(...)} map from a transform() result,
    wiring in each household's knowledge-platform count and exposure score."""
    import collections as _c
    kcount = _c.Counter()
    for s in data["capacity_sources"]:
        if s["indicator"] == "knowledge":
            kcount[s["household_kobo_id"]] += 1
    cap_by = {r["household_kobo_id"]: r for r in data["capacity_ind"]}
    out = {}
    for h in data["households"]:
        kid = h["kobo_id"]
        out[kid] = compute_indices(cap_by.get(kid, {}), kcount.get(kid, 0),
                                   h["hazard_exposure_score"] or 0.0)
    return out

# ================================================================= geospatial
# Altitude-derived analytics, computed at BUILD time only (like the indices
# above — never written to the household dict, so the loader / cva_* schema stay
# untouched). Altitude is the 3rd token of the Kobo gps_location string.
#
#   * elevation banding + an altitude-derived agro-ecological-zone proxy
#   * crop-altitude suitability mismatch (crop grown outside its optimal band)
#   * a spatial hotspot pass (grid-bucketed DBSCAN) + global Moran's I on the VI
import math

ELEV_BANDS = [(0, 1000, "<1000 m"), (1000, 1500, "1000–1500 m"),
              (1500, 2000, "1500–2000 m"), (2000, 9999, "2000 m+")]
# same edges, agro-ecological labels (tropical East-Africa highland gradient)
AEZ_LABELS = ["Lowland (<1000 m)", "Midland (1000–1500 m)",
              "Highland (1500–2000 m)", "Afro-montane (2000 m+)"]

def elevation_band_index(alt):
    if alt is None:
        return -1
    for i, (lo, hi, _) in enumerate(ELEV_BANDS):
        if lo <= alt < hi:
            return i
    return -1

def elevation_band(alt):
    i = elevation_band_index(alt)
    return ELEV_BANDS[i][2] if i >= 0 else None

# optimal altitude range (m) per main crop, matched by keyword on the crop label.
# Agronomic guidance for East-African highlands; farmers outside their crop's range
# are flagged as a crop-altitude mismatch (an independent vulnerability signal).
# Non-crop livelihoods and crops absent here are never flagged (unknown, not a miss).
# Order matters: more specific keywords first (sweet potato before potato, etc.).
CROP_ALT_RANGES = [
    ("arabica", 1300, 2100), ("robusta", 800, 1500), ("coffee", 800, 2100),
    ("tea", 1400, 2700),
    ("sweet potato", 0, 2000), ("irish", 1500, 3000), ("potato", 1500, 3000),
    ("banana", 800, 2000), ("matooke", 800, 2000), ("plantain", 800, 2000),
    ("maize", 0, 2200),
    ("soy", 0, 1600), ("bean", 600, 2200),
    ("wheat", 1500, 3000), ("barley", 2000, 3000),
    ("sorghum", 0, 1900), ("millet", 0, 2000), ("rice", 0, 1600),
    ("sugar", 0, 1600), ("cassava", 0, 1600),
    ("avocado", 800, 2200), ("macadamia", 700, 2100), ("passion", 1000, 2100),
    ("mango", 0, 1200), ("cotton", 0, 1300), ("groundnut", 0, 1500),
    ("sunflower", 0, 2000),
]

def crop_alt_range(crop_label):
    if not crop_label:
        return None
    s = crop_label.lower()
    for kw, lo, hi in CROP_ALT_RANGES:
        if kw in s:
            return (lo, hi)
    return None

def crop_alt_mismatch(crop_label, alt):
    """1 = altitude outside the crop's optimal band; 0 = within; None = unknown
    (altitude missing, or crop not in the reference table)."""
    if alt is None:
        return None
    rng = crop_alt_range(crop_label)
    if rng is None:
        return None
    return 1 if (alt < rng[0] or alt > rng[1]) else 0

def _haversine_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dla, dlo = la2 - la1, lo2 - lo1
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def _grid(points, eps_km):
    cell = eps_km / 111.0                       # ~deg per eps (1 deg lat ~111 km)
    g = {}
    for i, (la, lo) in enumerate(points):
        g.setdefault((int(la / cell), int(lo / cell)), []).append(i)
    return g, cell

def spatial_clusters(points, eps_km=5.0, min_pts=5):
    """Grid-bucketed DBSCAN over (lat,lon). Returns a cluster-id list aligned to
    `points` (-1 = noise / scattered). Near-linear thanks to the spatial index."""
    n = len(points)
    labels = [-1] * n
    if n == 0:
        return labels
    grid, cell = _grid(points, eps_km)

    def neighbors(i):
        la, lo = points[i]
        cx, cy = int(la / cell), int(lo / cell)
        out = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if j != i and _haversine_km(points[i], points[j]) <= eps_km:
                        out.append(j)
        return out

    visited = [False] * n
    cid = -1
    for i in range(n):
        if visited[i]:
            continue
        visited[i] = True
        nb = neighbors(i)
        if len(nb) < min_pts:
            continue                            # not a core point
        cid += 1
        labels[i] = cid
        seed, k = list(nb), 0
        while k < len(seed):
            j = seed[k]; k += 1
            if not visited[j]:
                visited[j] = True
                nbj = neighbors(j)
                if len(nbj) >= min_pts:
                    seed.extend(nbj)
            if labels[j] == -1:
                labels[j] = cid
    return labels

def morans_i(points, values, eps_km=5.0):
    """Global Moran's I of `values` under a binary distance weight (neighbours
    within eps_km). Grid-bucketed. Returns (I, n_weighted_pairs); (None,0) if
    undefined. I>0 => the values are spatially clustered."""
    n = len(points)
    if n < 3:
        return (None, 0)
    mean_v = sum(values) / n
    dev = [v - mean_v for v in values]
    denom = sum(d * d for d in dev)
    if denom == 0:
        return (None, 0)
    grid, cell = _grid(points, eps_km)
    num, W = 0.0, 0
    for i, (la, lo) in enumerate(points):
        cx, cy = int(la / cell), int(lo / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for j in grid.get((cx + dx, cy + dy), ()):
                    if j != i and _haversine_km(points[i], points[j]) <= eps_km:
                        num += dev[i] * dev[j]
                        W += 1
    if W == 0:
        return (None, 0)
    return (round((n / W) * (num / denom), 3), W)

# =================================================================== transform
def transform(records, formdef):
    decode, is_known = build_decoder(formdef)
    households, hazard_rows, impact_rows, cap_rows, cap_src_rows, adapt_rows = [], [], [], [], [], []

    for r in records:
        seg = {k: v for k, v in r.items() if not isinstance(v, (list, dict))}
        kid = r.get("_id")
        sub_time = r.get("_submission_time")
        flags = []

        # ---- geography / identity ----
        lat, lon, alt = geo_split(pick(seg, "gps_location"))
        country = decode("admin_level_0", pick(seg, "admin_level_0"))       # -> label e.g. "Kenya"
        if country is None:
            country = country_from_gps(lat, lon)                            # legacy rows: recover from GPS
            if country is not None:
                flags.append("country_from_gps")
            else:
                flags.append("country_missing")
        a1_code = _s(pick(seg, "admin_level_1"))
        a1_label = decode("admin_level_1", a1_code) if a1_code else None
        if a1_code is None:
            flags.append("admin1_missing")
        admin2 = _s(pick(seg, "admin_level_2"))
        proj_code = _s(pick(seg, "project"))
        proj_label = decode("project", proj_code) if proj_code else None

        gib = in_bounds(lat, lon, country)
        if lat is None:
            flags.append("gps_missing")
        elif gib is False:
            flags.append("geo_out_of_bounds")

        farmer_id = _s(pick(seg, "farmer_id"))
        if farmer_id is None:
            flags.append("farmer_id_missing")

        # main crop: field renamed farmer_main_crop (new) / main_crop (old)
        crop_code = _s(pick_first(seg, "farmer_main_crop", "main_crop"))
        crop_label = decode("farmer_main_crop", crop_code) if crop_code else None

        dob = _s(pick(seg, "date_of_birth"))
        age = None
        dy, sy = year_of(dob), year_of(sub_time)
        if dy and sy:
            age = sy - dy
            if age < 10 or age > 100:
                flags.append("age_implausible")
                age = None

        fsize = _num(pick(seg, "field_size"))
        funit = _s(pick(seg, "field_unit"))
        fsize_ha = round(fsize * UNIT_HA[funit], 4) if (fsize is not None and funit in UNIT_HA) else None

        hh_size = _int(pick(seg, "household_size"))
        if hh_size is not None and (hh_size < 1 or hh_size > 30):
            flags.append("household_size_outlier")

        # ---- hazards (exposure) ----
        hz_raw = pick(seg, "hazards")
        hz_codes = hz_raw.split() if isinstance(hz_raw, str) and hz_raw else []
        exposure_raw, n_haz = 0, 0
        for code in hz_codes:
            if code in ("other", "none"):
                continue
            n_haz += 1
            sev = freq = sev_wt = freq_wt = None
            if code in HAZARDS:
                sev_f, freq_f = HAZARDS[code]
                sev_c = _s(pick(seg, sev_f))
                freq_c = _s(pick(seg, freq_f))
                sev = decode("level_river_flood", sev_c) if sev_c else None      # all levels share high_low_scale
                freq = decode("river_flood_frequency", freq_c) if freq_c else None
                sev_wt = SEV_WT.get(sev_c) if sev_c else None
                freq_wt = FREQ_WT.get(freq_c) if freq_c else None
            exposure_raw += (sev_wt or 1) * (freq_wt or 1)
            hazard_rows.append(dict(
                household_kobo_id=kid, hazard_code=code,
                hazard_label=decode("hazards", code), severity=sev, severity_wt=sev_wt,
                frequency=freq, frequency_wt=freq_wt))
        hazard_exposure_score = round(min(100.0, 100.0 * exposure_raw / 90.0), 1) if n_haz else 0.0

        # ---- impacts ----
        for field, cat in IMPACT_FIELDS.items():
            val = pick(seg, field)
            if not isinstance(val, str) or not val:
                continue
            for code in val.split():
                if code == "none":
                    continue
                if not is_known(field, code):
                    if "legacy_impact_code" not in flags:
                        flags.append("legacy_impact_code")
                impact_rows.append(dict(
                    household_kobo_id=kid, category=cat, impact_code=code,
                    impact_label=decode(field, code)))

        # ---- capacity indicators (scalar) ----
        cap = dict(household_kobo_id=kid)
        for field, col in CAP_BOOL.items():
            cap[col] = yesno(pick(seg, field))
        cap["education_level"] = decode("level_of_education", pick(seg, "level_of_education"))
        cap_rows.append(cap)
        answered = [cap[k] for k in CAP_SCORE_KEYS if cap[k] is not None]
        adaptive_capacity_score = round(100.0 * sum(1 for x in answered if x) / len(answered), 1) if answered else None

        # ---- capacity sources (multiselect) ----
        for field, ind in CAP_SOURCES.items():
            for code, label in (decode(field, pick(seg, field), multi=True) or []):
                cap_src_rows.append(dict(household_kobo_id=kid, indicator=ind,
                                         value_code=code, value_label=label))

        # ---- adaptation practices ----
        n_domains = 0
        for domain, gate_f, prac_f in DOMAINS:
            adopted = yesno(pick(seg, gate_f))
            if adopted:
                n_domains += 1
                practices = decode(prac_f, pick(seg, prac_f), multi=True) or []
                if practices:
                    for code, label in practices:
                        adapt_rows.append(dict(household_kobo_id=kid, domain=domain,
                                               domain_adopted=True, practice_code=code, practice_label=label))
                else:
                    adapt_rows.append(dict(household_kobo_id=kid, domain=domain, domain_adopted=True,
                                           practice_code="__adopted__", practice_label="Adopted (no detail)"))
            else:
                adapt_rows.append(dict(household_kobo_id=kid, domain=domain,
                                       domain_adopted=bool(adopted) if adopted is not None else False,
                                       practice_code="__not_adopted__", practice_label="Not adopted"))

        households.append(dict(
            kobo_id=kid, uuid=r.get("_uuid"), submitted_at=sub_time,
            date_today=_s(pick(seg, "date_today")), enumerator=_s(pick(seg, "enum_name")),
            country=country, admin1=a1_code, admin1_label=a1_label, admin2=admin2,
            project=proj_code, project_label=proj_label,
            first_name=_s(pick(seg, "first_name")), last_name=_s(pick(seg, "last_name")),
            farmer_id=farmer_id, gender=decode("gender", pick(seg, "gender")),
            date_of_birth=dob, age=age, marital_status=decode("marital_status", pick(seg, "marital_status")),
            main_crop=crop_label, main_crop_other=_s(pick(seg, "Specify")),
            field_size=fsize, field_unit=funit, field_size_ha=fsize_ha, household_size=hh_size,
            lat=lat, lon=lon, altitude=alt, geo_in_bounds=gib,
            n_hazards=n_haz, hazard_exposure_score=hazard_exposure_score,
            adaptive_capacity_score=adaptive_capacity_score, n_domains_adopted=n_domains,
            priority_flag=None,                       # set in second pass (needs country medians)
            dq_flags=",".join(flags) or None))

    # ---- second pass: duplicate farmer_id + priority_flag (country medians) ----
    from collections import Counter, defaultdict
    id_counts = Counter(h["farmer_id"] for h in households if h["farmer_id"])
    by_country_exp, by_country_cap = defaultdict(list), defaultdict(list)
    for h in households:
        by_country_exp[h["country"]].append(h["hazard_exposure_score"])
        if h["adaptive_capacity_score"] is not None:
            by_country_cap[h["country"]].append(h["adaptive_capacity_score"])

    def median(xs):
        xs = sorted(x for x in xs if x is not None)
        n = len(xs)
        if n == 0:
            return None
        return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

    med_exp = {c: median(v) for c, v in by_country_exp.items()}
    med_cap = {c: median(v) for c, v in by_country_cap.items()}
    for h in households:
        if h["farmer_id"] and id_counts[h["farmer_id"]] > 1:
            h["dq_flags"] = ((h["dq_flags"] + ",") if h["dq_flags"] else "") + "dup_farmer_id"
        me, mc = med_exp.get(h["country"]), med_cap.get(h["country"])
        cap = h["adaptive_capacity_score"]
        h["priority_flag"] = bool(me is not None and mc is not None and cap is not None
                                  and h["hazard_exposure_score"] >= me and cap <= mc)
    return dict(households=households, hazard_exposure=hazard_rows, impacts=impact_rows,
                capacity_ind=cap_rows, capacity_sources=cap_src_rows, adaptation=adapt_rows)

def run(ddir=DDIR):
    recs = json.load(open(os.path.join(ddir, "cva_raw.json"), encoding="utf-8"))
    recs = recs["results"] if isinstance(recs, dict) and "results" in recs else recs
    fdef = json.load(open(os.path.join(ddir, "cva_formdef.json"), encoding="utf-8"))
    out = transform(recs, fdef)
    for name, rows in out.items():
        json.dump(rows, open(os.path.join(ddir, f"clean_{name}.json"), "w", encoding="utf-8"), default=str)
    return out

if __name__ == "__main__":
    o = run()
    hh = o["households"]
    print(f"households: {len(hh)} | hazards: {len(o['hazard_exposure'])} | impacts: {len(o['impacts'])} "
          f"| capacity: {len(o['capacity_ind'])} | sources: {len(o['capacity_sources'])} "
          f"| adaptation: {len(o['adaptation'])}")
    from collections import Counter
    print("by country:", dict(Counter(h["country"] for h in hh)))
    print("priority households:", sum(1 for h in hh if h["priority_flag"]))
    flagged = [h["dq_flags"] for h in hh if h["dq_flags"]]
    print(f"rows with dq_flags: {len(flagged)} / {len(hh)}")
    print("sample flags:", flagged[:5])
