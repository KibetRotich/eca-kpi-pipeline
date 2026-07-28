"""Build the static Cool Farm dashboard (Pattern A, as per VSLA / CVA / HC).

Reads the cfp_* analytics store with the service-role key at BUILD time and
renders a self-contained HTML into masp4-platform/public/. Nothing queries
Supabase at runtime, so the anon key never touches the cfp_ tables and the
authenticated-only RLS on them stays intact.

    python pipeline/coolfarm/build_dashboard.py

Disclosure control (deliberate, see docs/data-architecture.md §5):
  * No names, phones, villages or sub-counties are embedded.
  * The farm-level fact table carries NO coordinates -- district is the finest
    geography on a row.
  * The spatial layer is aggregated to ~2.2 km grid cells with small-cell
    suppression (n < MIN_CELL dropped), because public/*.html is gated only by
    an UNVERIFIED cookie pre-filter in proxy.ts, not by requireOrgSession().
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PLATFORM = os.path.abspath(os.path.join(HERE, "..", ".."))
TEMPLATE = os.path.join(HERE, "dashboard_template.html")
OUT = os.path.join(PLATFORM, "public", "Cool_Farm_Dashboard.html")

GRID = 0.02      # ~2.2 km cells
MIN_CELL = 3     # suppress grid cells with fewer than this many farms
PAGE = 1000

RESIDUE_STREAMS = ["pruning", "leaf_litter", "fruit", "dead_plant",
                   "end_of_life_cycle", "life_cycle_end_woody_roots",
                   "life_cycle_end_leaves", "pulp_hask", "seed"]
# Fate order is fixed by the validated palette order, not by semantics --
# see the palette note in dashboard_template.html.
FATE_ORDER = ["left_on_soil", "aerobic_compost", "heaps_pits",
              "anaerobic_compost", "burn", "export"]


def load_env():
    env = dict(os.environ)
    here = HERE
    for _ in range(6):
        for name in (".env.local", ".env"):
            p = os.path.join(here, name)
            if os.path.exists(p):
                for line in open(p, encoding="utf-8"):
                    m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", line)
                    if m and m.group(1) not in env:
                        env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    return env


ENV = load_env()
SB_URL = (ENV.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SB_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY")


def sb(path):
    """GET from PostgREST, paging past the 1000-row response cap."""
    rows = []
    for start in range(0, 10**7, PAGE):
        sep = "&" if "?" in path else "?"
        url = f"{SB_URL}/rest/v1/{path}{sep}limit={PAGE}&offset={start}"
        req = urllib.request.Request(url, headers={
            "apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}",
            "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                batch = json.load(r)
        except urllib.error.HTTPError as e:
            sys.exit(f"HTTP {e.code} on {path}\n{e.read().decode()[:500]}")
        rows.extend(batch)
        if len(batch) < PAGE:
            break
    return rows


# --- helpers ----------------------------------------------------------
def enc(values):
    """Dictionary-encode a categorical column -> (levels, codes)."""
    levels, index = [], {}
    codes = []
    for v in values:
        key = v if v is not None else ""
        if key not in index:
            index[key] = len(levels)
            levels.append(key)
        codes.append(index[key])
    return levels, codes


def r(v, nd=3):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd)


def main():
    if not (SB_URL and SB_KEY):
        sys.exit("Supabase URL / service-role key not found")
    print("reading analytics store ...")

    farms = sb("v_cfp_farm_analytics?select=submission_id,project,region,district,"
               "crop_type,crop_species,crop_system,is_shaded,gender,age_band,is_youth,"
               "literacy_level,soil_type,crop_age_band,submission_month,enumerator,"
               "area_ha,household_size,plants_per_ha,crop_age,total_yield_t,yield_t_per_ha,"
               "n_kg_per_ha,p2o5_kg_per_ha,k2o_kg_per_ha,organic_fert_share,ai_kg_per_ha,"
               "tonne_km,energy_litres,irrigation_water_m3,shade_cover_perc,"
               "intercrop_cover_perc,hedge_area_m2,residue_burn_share,dead_plants_perc,"
               "waste_fruit_perc,fertilizer_applied,pesticide_applied,fuel_energy_used,"
               "irrigation_used,intercrop_exists,shade_trees_exist,hedges_exist,"
               "land_use_change_exists,cooperative_member,disability,"
               "access_to_mobile_device,access_to_internet,forest_change,de_area_ha,"
               "net_forest_area_ha,dq_flag_count,dq_error_count,latitude,longitude")
    print(f"  farms: {len(farms)}")

    residues = sb("v_cfp_residue_long?select=submission_id,stream,fate,pct")
    print(f"  residue rows: {len(residues)}")

    transitions = sb("v_cfp_land_use_transitions?select=*")
    district_geo = sb("v_cfp_district_geo?select=*")
    region_geo = sb("v_cfp_region_geo?select=*")
    dq = sb("v_cfp_dq_summary?select=code,severity,field,n_flags,n_submissions")
    burn = sb("v_cfp_burn_summary?select=*")
    fert = sb("v_cfp_fertilizer_long?select=submission_id,fertiliser_type,is_organic,"
              "prod_region,rate_kg_per_ha,n_pct,n_kg_per_ha,rate_uom")
    pest = sb("v_cfp_pesticide_long?select=submission_id,category,pesticide_type,"
              "perc_field_applied,active_ingredient_pct,rate_per_ha,ai_kg_per_ha")
    trans = sb("v_cfp_transport_long?select=submission_id,transport_type,boundary,"
               "weight_kg,distance_km,tonne_km")
    agro = sb("v_cfp_agroforestry_long?select=submission_id,kind,species,cover_perc,"
              "density_per_ha,area_m2")
    rare = sb("v_cfp_rare_inputs?select=kind,detail,amount,unit")
    outliers = sb("v_cfp_geo_outliers?select=district,km_from_district_centroid")
    overview = sb("v_cfp_overview?select=*")
    meta = sb("cfp_sync_meta?select=*&id=eq.1")

    # --- farm fact table: dictionary-encoded, coordinates EXCLUDED -----
    CATS = ["project", "region", "district", "crop_type", "crop_species",
            "crop_system", "gender", "age_band", "literacy_level", "soil_type",
            "crop_age_band", "submission_month", "forest_change", "enumerator"]
    NUMS = ["area_ha", "household_size", "plants_per_ha", "crop_age", "total_yield_t",
            "yield_t_per_ha", "n_kg_per_ha", "p2o5_kg_per_ha", "k2o_kg_per_ha",
            "organic_fert_share", "ai_kg_per_ha", "tonne_km", "energy_litres",
            "irrigation_water_m3", "shade_cover_perc", "intercrop_cover_perc",
            "hedge_area_m2", "residue_burn_share", "dead_plants_perc",
            "waste_fruit_perc", "de_area_ha", "net_forest_area_ha",
            "dq_flag_count", "dq_error_count"]
    BOOLS = ["is_shaded", "is_youth", "fertilizer_applied", "pesticide_applied",
             "fuel_energy_used", "irrigation_used", "intercrop_exists",
             "shade_trees_exist", "hedges_exist", "land_use_change_exists",
             "cooperative_member", "disability", "access_to_mobile_device",
             "access_to_internet"]

    # Enumerators are pseudonymised before encoding. The between-enumerator
    # variance in residue burn share is one of this dashboard's most important
    # findings, but it is a measurement-quality signal -- publishing a named
    # per-staff-member ranking is not the point, and this file lands in a PUBLIC
    # repository. Stable codes (sorted by name) preserve the analysis exactly.
    enum_names = sorted({f.get("enumerator") for f in farms if f.get("enumerator")})
    enum_code = {n: f"E{i + 1:02d}" for i, n in enumerate(enum_names)}
    for f in farms:
        f["enumerator"] = enum_code.get(f.get("enumerator"))
    print(f"  enumerators pseudonymised: {len(enum_code)} -> E01..E{len(enum_code):02d}")

    levels, codes = {}, {}
    for c in CATS:
        levels[c], codes[c] = enc([f.get(c) for f in farms])
    fact = {
        "n": len(farms),
        "cats": {c: levels[c] for c in CATS},
        "codes": {c: codes[c] for c in CATS},
        "nums": {c: [r(f.get(c), 4) for f in farms] for c in NUMS},
        "bools": {c: [(1 if f.get(c) else (0 if f.get(c) is not None else None))
                      for f in farms] for c in BOOLS},
    }

    # --- residue cube: farm index x stream x fate ---------------------
    idx_by_sub = {f["submission_id"]: i for i, f in enumerate(farms)}
    # Dense per-farm matrix keyed [stream][fate] -> list over farms.
    cube = {s: {ft: [None] * len(farms) for ft in FATE_ORDER} for s in RESIDUE_STREAMS}
    for row in residues:
        i = idx_by_sub.get(row["submission_id"])
        if i is None:
            continue
        s, ft = row["stream"], row["fate"]
        if s in cube and ft in cube[s]:
            cube[s][ft][i] = r(row["pct"], 1)

    # --- spatial grid with small-cell suppression ---------------------
    cells = {}
    for f in farms:
        la, lo = f.get("latitude"), f.get("longitude")
        if la is None or lo is None:
            continue
        key = (round(float(la) / GRID) * GRID, round(float(lo) / GRID) * GRID)
        c = cells.setdefault(key, {"n": 0, "burn": [], "shade": [], "n_kg": []})
        c["n"] += 1
        for src, dst in (("residue_burn_share", "burn"), ("shade_cover_perc", "shade"),
                         ("n_kg_per_ha", "n_kg")):
            v = f.get(src)
            if v is not None:
                c[dst].append(float(v))
    mean = lambda xs: round(sum(xs) / len(xs), 1) if xs else None
    grid = [{"lat": round(k[0], 3), "lon": round(k[1], 3), "n": v["n"],
             "burn": mean(v["burn"]), "shade": mean(v["shade"]),
             "n_kg": mean(v["n_kg"])}
            for k, v in sorted(cells.items()) if v["n"] >= MIN_CELL]
    suppressed = sum(v["n"] for v in cells.values() if v["n"] < MIN_CELL)
    print(f"  grid cells: {len(grid)} kept, {suppressed} farms in suppressed cells")

    # --- child-table rollups (aggregate; no submission ids emitted) ---
    def tally(rows, key, extra=None):
        """Count rows by `key`, plus mean/median for each (name, column) in extra.

        `n` is reserved for the row count -- an extra metric may not use it.
        """
        for name, _ in (extra or []):
            assert name != "n", "metric name 'n' collides with the row count"
        out = {}
        for row in rows:
            k = row.get(key) or "(unspecified)"
            e = out.setdefault(k, {"n": 0})
            e["n"] += 1
            for name, col in (extra or []):
                v = row.get(col)
                if v is not None:
                    e.setdefault(name, []).append(float(v))
        for e in out.values():
            for name, _ in (extra or []):
                if name in e:
                    vals = sorted(e[name])
                    e[name] = {"mean": round(sum(vals) / len(vals), 3),
                               "med": round(vals[len(vals) // 2], 3), "n": len(vals)}
        return out

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "sync": (meta or [{}])[0],
        "overview": (overview or [{}])[0],
        "fact": fact,
        "residue_cube": cube,
        "streams": RESIDUE_STREAMS,
        "fates": FATE_ORDER,
        "burn_summary": burn,
        "transitions": transitions,
        "district_geo": district_geo,
        "region_geo": region_geo,
        "grid": grid,
        "grid_meta": {"cell_deg": GRID, "min_cell": MIN_CELL,
                      "suppressed_farms": suppressed, "cells": len(grid)},
        "dq": dq,
        "fert_types": tally(fert, "fertiliser_type",
                            [("rate", "rate_kg_per_ha"), ("nkg", "n_kg_per_ha")]),
        "fert_regions": tally(fert, "prod_region"),
        "fert_uoms": tally(fert, "rate_uom"),
        "fert_organic": {
            "organic": sum(1 for x in fert if x.get("is_organic") is True),
            "synthetic": sum(1 for x in fert if x.get("is_organic") is False),
            "unknown": sum(1 for x in fert if x.get("is_organic") is None),
            "n_with_n_pct": sum(1 for x in fert if x.get("n_pct") is not None),
            "total": len(fert)},
        "pest_types": tally(pest, "pesticide_type",
                            [("rate", "rate_per_ha"), ("ai", "ai_kg_per_ha"),
                             ("field", "perc_field_applied")]),
        "pest_cats": tally(pest, "category"),
        "transport_types": tally(trans, "transport_type",
                                 [("tkm", "tonne_km"), ("km", "distance_km"),
                                  ("kg", "weight_kg")]),
        "transport_boundary": tally(trans, "boundary", [("tkm", "tonne_km")]),
        "agro": tally(agro, "species", [("cover", "cover_perc"),
                                        ("density", "density_per_ha")]),
        "agro_kinds": tally(agro, "kind", [("cover", "cover_perc")]),
        "rare": tally(rare, "detail", [("amount", "amount")]),
        "rare_kinds": tally(rare, "kind", [("amount", "amount")]),
        "geo_outliers": {
            "gt50km": sum(1 for x in outliers
                          if (x.get("km_from_district_centroid") or 0) > 50),
            "gt100km": sum(1 for x in outliers
                           if (x.get("km_from_district_centroid") or 0) > 100),
            "max_km": max((x.get("km_from_district_centroid") or 0)
                          for x in outliers) if outliers else None,
            "by_district": tally([x for x in outliers
                                  if (x.get("km_from_district_centroid") or 0) > 50],
                                 "district")},
    }

    tpl = open(TEMPLATE, encoding="utf-8").read()
    blob = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    html = tpl.replace("/*__DATA__*/null", blob)
    html = html.replace("__GENERATED_AT__", payload["generated_at"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrote {OUT}  ({len(html)/1024:.0f} KB, data {len(blob)/1024:.0f} KB)")

    # Fail loudly if anything identifying slipped into the payload.
    for banned in ("farmer_first_name", "phone_number", "village_raw",
                   "farmer_other_names", "subcounty_raw", "instanceName",
                   *enum_names):
        if banned in blob:
            sys.exit(f"ABORT: '{banned}' present in embedded payload")
    if '"latitude"' in blob or '"longitude"' in blob:
        sys.exit("ABORT: raw coordinates present in embedded payload")
    print("PII guard: clean (no names/phones/villages, no raw coordinates)")


if __name__ == "__main__":
    main()
