"""
HC/SAVE Tree-Survival analysis — Step 1 prep pipeline.
Reshapes Form 1 (batch grain, Uganda/Harvesting Carbon) and
Form 2 (species-repeat grain, Kenya/SAVE KE) into clean analytic tables.

Grain decision (documented in memo): option (b) — keep the two forms as
separate cohorts. Form 2 species detail is retained as a long enrichment
table AND aggregated up to batch grain purely so batch-level TOTALS are
comparable with Form 1. The two forms are NOT merged into one row set.
"""
import json, re, unicodedata
import numpy as np
import pandas as pd

DATA = "data"
OUT = "out"

# ---------------------------------------------------------------- helpers
def load(fn):
    return json.load(open(f"{DATA}/{fn}", encoding="utf-8"))

def find_col(cols, *subs):
    """First column containing ALL given substrings (case-sensitive)."""
    for c in cols:
        if all(s in c for s in subs):
            return c
    return None

def to_num(s):
    return pd.to_numeric(s, errors="coerce")

# ---------------------------------------------------------------- decode maps
# Form 2 decode built automatically from the on-disk XLSForm definition.
f2def = load("form2_formdef.json")
f2_list = {}                       # list_name -> {code: label}
for ch in f2def["choices"]:
    f2_list.setdefault(ch["list_name"], {})[ch["name"]] = (ch.get("label") or [""])[0]
f2_field_list = {}                 # field name -> list_name
f2_field_label = {}
f2_field_type = {}
f2_field_group = {}
_grp = []
for r in f2def["survey"]:
    t = r.get("type", "")
    if t in ("begin_group", "begin_repeat"):
        _grp.append(r.get("name", ""))
        continue
    if t in ("end_group", "end_repeat"):
        if _grp: _grp.pop()
        continue
    nm = r.get("name")
    if not nm: continue
    f2_field_label[nm] = (r.get("label") or [""])[0]
    f2_field_type[nm] = t
    f2_field_group[nm] = "/".join(_grp)
    if r.get("select_from_list_name"):
        f2_field_list[nm] = r["select_from_list_name"]

def dec2(field, code):
    """Decode a Form-2 select code (single) to label."""
    if code is None or (isinstance(code, float) and np.isnan(code)): return code
    ln = f2_field_list.get(field)
    if not ln: return code
    return f2_list.get(ln, {}).get(str(code), code)

def dec2_multi(field, val):
    if not isinstance(val, str) or val == "": return val
    ln = f2_field_list.get(field)
    return "; ".join(f2_list.get(ln, {}).get(c, c) for c in val.split())

# Form 1 decode maps (transcribed from get_form_content id=aVfWPw45B9gB46AEJXVHwS)
F1 = {
 "transport": {"pick_up_trucks_lorries":"Pick-up trucks/Lorries","motorcycles__boda_bodas":"Motorcycles (Boda bodas)",
   "bicycles":"Bicycles","wheelbarrows":"Wheelbarrows","head_or_hand_carrying_other":"Head/hand carrying/Other"},
 "growth": {"very_good":"Very Good","good":"Good","same":"Same","poor":"Poor","very_poor":"Very poor"},
 "challenges": {"weather_conditions__drought__floods_e_t_":"Weather (drought/floods)","soil_conditions":"Soil conditions",
   "pest___diseases":"Pest & Diseases","physical_injuries_of_seedlings":"Physical injuries","theft":"Theft",
   "eaten_by_grazing_animals":"Eaten by grazing animals","others":"Others"},
 "species": {"albizia_corriaria__mugavu_omusisa":"Albizia Corriaria","ficus_mucuso_mukunyu_omukunyu":"Ficus Mucuso",
   "ficus_natalensis_mutuuba_omutooma_ekitoo":"Ficus Natalensis","calliandra":"Calliandra"},
 "height": {"above_average_5m":"Above average (>5m)","average_1_5_4m":"Average (1.5-4m)","below_0_1m":"Below (0-1m)"},
 "health": {"healthy":"Healthy","same":"Same","unhealthy":"Unhealthy"},
 "trainorg": {"solidaridad":"Solidaridad","ngos_csos":"NGOs/CSOs","ministry_of_agriculture":"Ministry of Agriculture","other":"Other"},
 "yesno": {"yes":"Yes","no":"No"},
}
def dec1(mapname, val):
    if not isinstance(val, str) or val == "": return val
    m = F1[mapname]
    if " " in val:  # multi
        return "; ".join(m.get(c, c) for c in val.split())
    return m.get(val, val)

# ================================================================ FORM 1 (batch grain)
r1 = load("form1_all.json")
d1 = pd.DataFrame(r1)
c1 = list(d1.columns)

f1 = pd.DataFrame()
f1["sub_id"] = d1["_id"]
f1["uuid"] = d1.get("_uuid")
f1["sub_time"] = pd.to_datetime(d1["_submission_time"], errors="coerce")
f1["geo"] = d1.get(find_col(c1, "Record_your_current_location"))
f1["district"] = d1[find_col(c1, "__district")].astype(str).str.strip().str.lower()
f1["farmer_ref"] = d1[find_col(c1, "__farmer_ref")]
f1["farmer_code"] = d1.get(find_col(c1, "__farmer_code"))
f1["farmer_gender"] = d1.get(find_col(c1, "__farmer_gender"))
f1["farmer_village"] = d1.get(find_col(c1, "__farmer_village"))
f1["farmer_total_seedlings"] = to_num(d1.get(find_col(c1, "__farmer_total_seedlings")))
f1["received_all"] = dec1("yesno", d1.get(find_col(c1, "Did_you_receive_any_participated"))) if find_col(c1,"Did_you_receive_any_participated") else None
f1["species_taken"] = d1[find_col(c1, "What_type_of_tree_sp_edlings")].apply(lambda v: dec1("species", v))
f1["transport"] = d1[find_col(c1, "How_did_you_transfer")].apply(lambda v: dec1("transport", v))
f1["growth_perception"] = d1[find_col(c1, "How_does_the_trees_g_rate")].apply(lambda v: dec1("growth", v))
f1["had_challenges"] = d1[find_col(c1, "Were_there_any_chall_n_planting")].apply(lambda v: dec1("yesno", v))
f1["challenges"] = d1[find_col(c1, "What_type_of_challen_n_planting")].apply(lambda v: dec1("challenges", v))
# batch survival counts (group_uj1jp46)
f1["collected"] = to_num(d1[find_col(c1, "How_many_total_seedl_participated_in_both")])
f1["planted"] = to_num(d1[find_col(c1, "How_many_seedlings_did_you_plant")])
f1["not_planted"] = to_num(d1[find_col(c1, "How_many_seedlings_did_you_not_plant")])
f1["alive"] = to_num(d1[find_col(c1, "How_many_seedlings_a_a_healthy_condition")])
f1["dead"] = to_num(d1[find_col(c1, "How_many_seedlings_are_dead_or_damaged")])
f1["tree_height"] = d1[find_col(c1, "What_is_the_average_ll_alive")].apply(lambda v: dec1("height", v))
f1["tree_health"] = d1[find_col(c1, "What_is_the_current_of_the_planted")].apply(lambda v: dec1("health", v))
f1["reason_death"] = d1.get(find_col(c1, "What_is_the_reason_for_death_or_damage"))
f1["reason_not_plant"] = d1.get(find_col(c1, "What_was_the_main_re_he_seedling_received"))
f1["training_received"] = d1[find_col(c1, "Have_you_received_an_roforestry")].apply(lambda v: dec1("yesno", v))
f1["training_org"] = d1[find_col(c1, "From_which_organisat_building")].apply(lambda v: dec1("trainorg", v)) if find_col(c1,"From_which_organisat_building") else None
f1["enumerator"] = d1.get(find_col(c1, "Enumerator_names"))
# coffee sub-section (group_wk0hx57).  NB misleading name: "How_many_seedlings_did_you_receive" is COFFEE received.
f1["coffee_received"] = to_num(d1.get(find_col(c1, "group_wk0hx57__How_many_seedlings_did_you_receive")))
f1["coffee_planted"] = to_num(d1.get(find_col(c1, "How_many_coffee_seedlings_did_you_plant")))
f1["coffee_alive"] = to_num(d1.get(find_col(c1, "How_many_coffee_seed_ings_are_alive_today")))
f1["coffee_replanted"] = d1.get(find_col(c1, "Have_you_replanted_g_ed_missing")).apply(lambda v: dec1("yesno", v)) if find_col(c1,"Have_you_replanted_g_ed_missing") else None
f1["cohort"] = "Form1_UG_HC"

# split lat/lon from geo ("lat lon alt acc")
def geo_split(s):
    if not isinstance(s, str) or not s.strip(): return (np.nan, np.nan)
    p = s.split()
    try: return (float(p[0]), float(p[1]))
    except Exception: return (np.nan, np.nan)
f1[["lat","lon"]] = f1["geo"].apply(lambda s: pd.Series(geo_split(s)))

# survival rates
f1["surv_planted"] = f1["alive"] / f1["planted"]
f1["surv_collected"] = f1["alive"] / f1["collected"]

# ================================================================ FORM 2 (species repeat)
r2 = load("form2_all.json")
d2 = pd.DataFrame(r2)
c2 = list(d2.columns)

# ---- batch/submission-level frame
f2b = pd.DataFrame()
f2b["sub_id"] = d2["_id"]
f2b["uuid"] = d2.get("_uuid")
f2b["sub_time"] = pd.to_datetime(d2["_submission_time"], errors="coerce")
f2b["geo"] = d2.get(find_col(c2, "gps_point"))
f2b["farmer_ref"] = d2.get(find_col(c2, "farmer_ref_no"))
f2b["farmer_bene_id"] = d2.get(find_col(c2, "farmer__sol_beneficiary_id"))
f2b["admin2"] = d2.get(find_col(c2, "farmer__admin_level_2"))
f2b["admin3"] = d2.get(find_col(c2, "farmer__admin_level_3"))
f2b["farmer_village"] = d2.get(find_col(c2, "farmer__village"))
f2b["cooperative"] = d2.get(find_col(c2, "farmer__cooperative_name"))
f2b["farmer_phone"] = d2.get(find_col(c2, "farmer__phone_number"))
f2b["farmer_total_seedlings"] = to_num(d2.get(find_col(c2, "farmer__total_seedlings")))
f2b["total_seedlings_received"] = to_num(d2.get(find_col(c2, "total_seedlings_received")))
f2b["species_taken"] = d2.get(find_col(c2, "tree_species_received")).apply(lambda v: dec2_multi("tree_species_received", v))
f2b["transport"] = d2.get(find_col(c2, "transfer_the_trees")).apply(lambda v: dec2("transfer_the_trees", v))
f2b["growth_perception"] = d2.get(find_col(c2, "region_growth_comparison")).apply(lambda v: dec2("region_growth_comparison", v))
f2b["had_challenges"] = d2.get(find_col(c2, "__chall")).apply(lambda v: dec2("chall", v)) if find_col(c2,"__chall") else None
f2b["challenges"] = d2.get(find_col(c2, "challenges_in_planting")).apply(lambda v: dec2_multi("challenges_in_planting", v))
f2b["training_received"] = d2.get(find_col(c2, "__training")).apply(lambda v: dec2("training", v)) if find_col(c2,"__training") else None
f2b["enumerator"] = d2.get(find_col(c2, "enumerator_names"))
# crop + env/social/economic
f2b["crops_grown"] = d2.get(find_col(c2, "crop_progress__crops_grown")).apply(lambda v: dec2_multi("crops_grown", v)) if find_col(c2,"crop_progress__crops_grown") else None
f2b["crop_failure"] = d2.get(find_col(c2, "crop_failure")).apply(lambda v: dec2("crop_failure", v)) if find_col(c2,"crop_failure") else None
for fld in ["forest_cover_increase","soil_quality_improvement","env_benefits","biodiversity_evidence",
            "deforestation_reduction","economic_benefits_products"]:
    col = find_col(c2, fld)
    f2b[fld] = d2.get(col).apply(lambda v: dec2(fld, v)) if col else None
f2b["livelihood_benefit"] = d2.get(find_col(c2, "env_impact__livelihood_benefit")).apply(lambda v: dec2_multi("livelihood_benefit", v)) if find_col(c2,"env_impact__livelihood_benefit") else None
f2b["cohort"] = "Form2_KE_SAVE"
f2b[["lat","lon"]] = f2b["geo"].apply(lambda s: pd.Series(geo_split(s)))

# ---- species long frame (explode survival_rate repeat)
rows = []
for rec in r2:
    sid = rec["_id"]
    rep = rec.get("survival_rate") or []
    for i, sp in enumerate(rep):
        g = lambda k: sp.get(f"survival_rate/{k}")
        rows.append(dict(
            sub_id=sid, species_idx=i,
            species=dec2("species_name", g("species_name")),
            collected=pd.to_numeric(g("amount_species_collected"), errors="coerce"),
            planted=pd.to_numeric(g("amount_species_planted"), errors="coerce"),
            not_planted=pd.to_numeric(g("amount_species_notplanted"), errors="coerce"),
            alive=pd.to_numeric(g("amount_species_healthy"), errors="coerce"),
            dead=pd.to_numeric(g("amount_species_dead"), errors="coerce"),
            missing=pd.to_numeric(g("amount_species_missing"), errors="coerce"),
            tree_height=dec2("tree_height", g("tree_height")),
            tree_health=dec2("tree_health", g("tree_health")),
            reason_death=g("reason_species_death"),
        ))
f2s = pd.DataFrame(rows)
# join batch attributes onto species rows
f2s = f2s.merge(f2b[["sub_id","admin2","admin3","cooperative","transport","growth_perception",
                     "training_received","challenges","sub_time","farmer_total_seedlings"]],
                on="sub_id", how="left")
f2s["surv_planted"] = f2s["alive"] / f2s["planted"]
f2s["surv_collected"] = f2s["alive"] / f2s["collected"]

# ---- aggregate species up to batch (for cross-form TOTAL comparison only)
agg = f2s.groupby("sub_id").agg(
    collected=("collected","sum"), planted=("planted","sum"),
    not_planted=("not_planted","sum"), alive=("alive","sum"),
    dead=("dead","sum"), missing=("missing","sum"),
    n_species=("species","nunique")).reset_index()
f2b = f2b.merge(agg, on="sub_id", how="left")
f2b["surv_planted"] = f2b["alive"] / f2b["planted"]
f2b["surv_collected"] = f2b["alive"] / f2b["collected"]

# ================================================================ save
import os
os.makedirs("data/clean", exist_ok=True)
f1.drop(columns=["geo"]).to_csv("data/clean/form1_batch.csv", index=False)
f2b.drop(columns=["geo"]).to_csv("data/clean/form2_batch.csv", index=False)
f2s.to_csv("data/clean/form2_species.csv", index=False)

print("FORM 1 batch:", f1.shape, "| FORM 2 batch:", f2b.shape, "| FORM 2 species:", f2s.shape)
print("\nForm1 districts:", f1["district"].value_counts().to_dict())
print("Form2 admin2 top:", f2b["admin2"].value_counts().head(8).to_dict())
print("Form2 admin3 top:", f2b["admin3"].value_counts().head(8).to_dict())
print("\nForm1 sub_time range:", f1["sub_time"].min(), "->", f1["sub_time"].max())
print("Form2 sub_time range:", f2b["sub_time"].min(), "->", f2b["sub_time"].max())
print("\nForm2 species distinct:", f2s["species"].value_counts().to_dict())
print("Form2 mean species/submission:", round(f2s.groupby('sub_id').size().mean(),2))
print("\nSurvival (planted) — Form1 median:", round(f1["surv_planted"].median(),3),
      "| Form2 batch median:", round(f2b["surv_planted"].median(),3))
