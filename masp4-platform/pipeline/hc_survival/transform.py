"""
HC/SAVE tree-survival — canonical transform (Phase 2).

Reads raw Kobo JSON (form1_raw.json, form2_raw.json + form2_formdef.json) and
produces two clean, grain-aware record sets consumed by BOTH the Supabase loader
and the dashboard builder:

    batch   -> hcs_submissions   (one row per visit, BOTH cohorts)
    species -> hcs_species        (one row per species, Kenya/Form 2 only)

DEFENSIVE cleaning is baked in here (per the Phase-2 decision to handle DQ in
the pipeline, not at source):
  * farmer_lookup_ok  — registry lookup resolved? (UG fails ~12%)
  * transport_clean   — free-text transport recoded to a controlled list (KE)
  * geo_in_bounds     — GPS inside the country box
  * cooperative       — "Not provided"/blank variants -> NULL
  * impossible values — alive clipped to planted; survival clipped [0,1]
  * reason_death_bucket — free-text death reason bucketed
  * dq_flags          — per-row issue list, surfaced not hidden

Field names are keyed on their LAST path segment (version-robust), matching the
convention in pipeline/seedlings/fetch_seedlings_json.py.
"""
import os, re, json
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("HCS_DATA_DIR", os.path.join(HERE, "data"))

FORM1_UID = "aVfWPw45B9gB46AEJXVHwS"   # Harvesting Carbon — Uganda (batch grain)
FORM2_UID = "ahSMK3J7qQngQnXd76JkzF"   # SAVE KE — Kenya (species repeat)

UG_BOUNDS = dict(lat=(-1.6, 4.3), lon=(29.4, 35.2))
KE_BOUNDS = dict(lat=(-4.8, 5.2), lon=(33.8, 42.0))
MISSING_COOP = {"", "not provided", "not provided.", "none", "n/a", "na", "nil", "-", "0"}

# ---- Form 1 (UG) decode maps (from get_form_content id …v26_02_21) ----
F1 = {
 "transport": {"pick_up_trucks_lorries":"Pick-up trucks/Lorries","motorcycles__boda_bodas":"Motorcycles (Boda bodas)",
   "bicycles":"Bicycles","wheelbarrows":"Wheelbarrows","head_or_hand_carrying_other":"Head/hand carrying/Other"},
 "growth": {"very_good":"Very Good","good":"Good","same":"Same","poor":"Poor","very_poor":"Very poor"},
 "species": {"albizia_corriaria__mugavu_omusisa":"Albizia Corriaria","ficus_mucuso_mukunyu_omukunyu":"Ficus Mucuso",
   "ficus_natalensis_mutuuba_omutooma_ekitoo":"Ficus Natalensis","calliandra":"Calliandra"},
 "trainorg": {"solidaridad":"Solidaridad","ngos_csos":"NGOs/CSOs","ministry_of_agriculture":"Ministry of Agriculture","other":"Other"},
 "yesno": {"yes":"Yes","no":"No"},
}

def pick(d, fn):
    """Version-robust field access. Kobo JSON prefixes top-level fields with the
    group path joined by '__' (group_uv9pf76____farmer_code) and repeat fields
    with '/' (survival_rate/species_name). Field names may themselves contain
    '__' (farmer__sol_beneficiary_id), so we match on the group-separated suffix,
    not a naive split."""
    if fn in d: return d[fn]
    s1, s2 = "__"+fn, "/"+fn
    for k, v in d.items():
        if k.endswith(s1) or k.endswith(s2):
            return v
    return None
def _num(v):
    try:
        if v in (None,""): return None
        return float(v)
    except (TypeError, ValueError): return None
def _s(v): return v.strip() if isinstance(v,str) and v.strip() else None

def _dec(mp, v):
    if not isinstance(v,str) or not v: return v
    if " " in v: return "; ".join(mp.get(c,c) for c in v.split())
    return mp.get(v,v)

def geo_split(s):
    if not isinstance(s,str) or not s.strip(): return (None,None)
    p=s.split()
    try: return (float(p[0]), float(p[1]))
    except Exception: return (None,None)

def in_bounds(lat,lon,b):
    if lat is None or lon is None: return None
    return bool(b["lat"][0]<=lat<=b["lat"][1] and b["lon"][0]<=lon<=b["lon"][1])

# ---- transport controlled list (shared) ----
def transport_bucket(v):
    if not isinstance(v,str) or not v.strip(): return None
    t=v.lower()
    if re.search(r"motor|boda|motto|motob",t): return "Motorcycle"
    if re.search(r"wheel",t): return "Wheelbarrow"
    if re.search(r"donkey|ox|cart",t): return "Donkey/Ox-cart"
    if re.search(r"van|lorr|truck|pick|vehicle",t): return "Vehicle"
    if re.search(r"bicycle|bike",t): return "Bicycle"
    if re.search(r"head|hand|carri|foot|trek|walk|myself|my own|self|manual|sack|kiondo|bag|went",t): return "Head/hand/manual"
    return "Other"

DEATH_BUCKETS=[("Drought/water stress",r"drought|dry|water|sun|scorch|lack of rain"),
      ("Pests & diseases",r"pest|disease|termite|insect|aphid|fungal|rot"),
      ("Livestock/animals",r"animal|graz|goat|cattle|cow|livestock|brows|eaten|monkey|wild"),
      ("Weather/floods",r"flood|storm|wind|hail|cold|frost|waterlog"),
      ("Theft/damage",r"theft|stol|steal|vandal|damage|physical|burn|fire|slash"),
      ("Poor management/neglect",r"neglect|not water|manage|weed|care|abandon"),
      ("Soil/poor site",r"soil|infertile|rocky|acidic"),
      ("Transplant/quality",r"transplant|shock|weak seedling|small seedling|poor quality|nursery")]
def death_bucket(txt):
    if not isinstance(txt,str) or not txt.strip(): return None
    t=txt.lower()
    for lab,pat in DEATH_BUCKETS:
        if re.search(pat,t): return lab
    return "Other/unspecified"

def ke_wave(iso):
    if not iso: return None
    try:
        y=int(iso[:4]); m=int(iso[5:7])
    except Exception: return None
    if y==2024 or (y==2025 and m<=1): return "W1 2024Q4"
    if y==2025 and 5<=m<=8: return "W2 2025mid"
    if y==2025 and m>=10: return "W3 2025end"
    if y==2026 and m>=5: return "W4 2026mid"
    return f"other {y}-{m:02d}"

def _clip_counts(collected, planted, not_planted, alive, dead, missing=None):
    """Clip impossible values; return (values..., flags list)."""
    flags=[]
    if planted is not None and collected is not None and planted>collected+2:
        flags.append("planted>collected")
    if alive is not None and planted is not None and alive>planted:
        flags.append("alive>planted(clipped)")
        alive=planted
    sp=None
    if planted and planted>0 and alive is not None:
        sp=max(0.0,min(1.0,alive/planted))
    sc=None
    if collected and collected>0 and alive is not None:
        sc=max(0.0,min(1.0,alive/collected))
    return alive, sp, sc, flags

# =================================================================== FORM 1
def transform_form1(records):
    out=[]
    for r in records:
        seg={k:v for k,v in r.items() if not isinstance(v,(list,dict))}
        lat,lon=geo_split(pick(seg, "Record_your_current_location"))
        collected=_num(pick(seg, "How_many_total_seedl_participated_in_both"))
        planted=_num(pick(seg, "How_many_seedlings_did_you_plant"))
        not_planted=_num(pick(seg, "How_many_seedlings_did_you_not_plant"))
        alive=_num(pick(seg, "How_many_seedlings_a_a_healthy_condition"))
        dead=_num(pick(seg, "How_many_seedlings_are_dead_or_damaged"))
        alive,sp,sc,flags=_clip_counts(collected,planted,not_planted,alive,dead)
        farmer_id=_s(pick(seg, "__farmer_code"))
        lookup_ok=farmer_id is not None
        if not lookup_ok: flags.append("farmer_lookup_failed")
        gib=in_bounds(lat,lon,UG_BOUNDS)
        if gib is False: flags.append("geo_out_of_bounds")
        transport_raw=_dec(F1["transport"], pick(seg, "How_did_you_transfer_g_after_distribution"))
        out.append(dict(
            cohort="UG_HC", kobo_id=r.get("_id"), uuid=r.get("_uuid"),
            submitted_at=r.get("_submission_time"), country="Uganda",
            district=(_s(pick(seg, "district")) or "").lower() or None,
            admin2=None, admin3=None, village=_s(pick(seg, "__farmer_village")),
            cooperative=None, farmer_ref=_s(pick(seg, "farmer_ref")), farmer_id=farmer_id,
            farmer_gender=_s(pick(seg, "__farmer_gender")),
            farmer_total_seedlings=_num(pick(seg, "__farmer_total_seedlings")),
            farmer_lookup_ok=lookup_ok,
            species_taken=_dec(F1["species"], pick(seg, "What_type_of_tree_sp_edlings_distribution")),
            transport_raw=transport_raw, transport_clean=transport_bucket(transport_raw),
            growth_perception=_dec(F1["growth"], pick(seg, "How_does_the_trees_g_rate_for_the_region")),
            had_challenges=_dec(F1["yesno"], pick(seg, "Were_there_any_chall_n_planting_the_trees")),
            challenges=_s(pick(seg, "What_type_of_challen_n_planting_the_trees")),
            training_received=_dec(F1["yesno"], pick(seg, "Have_you_received_an_roforestry_practices")),
            collected=collected, planted=planted, not_planted=not_planted,
            alive=alive, dead=dead, missing=None,
            surv_planted=sp, surv_collected=sc, n_species=None,
            lat=lat, lon=lon, geo_in_bounds=gib, monitoring_wave=None,
            enumerator=_s(pick(seg, "Enumerator_names")),
            crops_grown=None, crop_failure=None, forest_cover_increase=None,
            soil_quality_improvement=None, biodiversity_evidence=None,
            deforestation_reduction=None, economic_benefits_products=None, livelihood_benefit=None,
            coffee_received=_num(pick(seg, "How_many_seedlings_did_you_receive")),  # NB: coffee grp
            coffee_planted=_num(pick(seg, "How_many_coffee_seedlings_did_you_plant")),
            coffee_alive=_num(pick(seg, "How_many_coffee_seed_ings_are_alive_today")),
            reason_death=_s(pick(seg, "What_is_the_reason_for_death_or_damage")),
            reason_death_bucket=death_bucket(pick(seg, "What_is_the_reason_for_death_or_damage")),
            dq_flags=",".join(flags) or None,
        ))
    return out

# =================================================================== FORM 2
def _f2_decoder(formdef):
    lists={}
    for ch in formdef["choices"]:
        lists.setdefault(ch["list_name"],{})[ch["name"]]=(ch.get("label") or [""])[0]
    field_list={r["name"]:r["select_from_list_name"] for r in formdef["survey"]
                if r.get("name") and r.get("select_from_list_name")}
    def dec(field,val,multi=False):
        if not isinstance(val,str) or not val: return val
        ln=field_list.get(field)
        if not ln: return val
        m=lists.get(ln,{})
        if multi: return "; ".join(m.get(c,c) for c in val.split())
        return m.get(val,val)
    return dec

def transform_form2(records, formdef):
    dec=_f2_decoder(formdef)
    batch=[]; species=[]
    for r in records:
        seg={k:v for k,v in r.items() if not isinstance(v,(list,dict))}
        sid=r.get("_id"); sub_time=r.get("_submission_time")
        lat,lon=geo_split(pick(seg, "gps_point"))
        gib=in_bounds(lat,lon,KE_BOUNDS)
        coop_raw=_s(pick(seg, "farmer__cooperative_name"))
        coop=None if (coop_raw is None or coop_raw.lower() in MISSING_COOP) else coop_raw
        admin3=_s(pick(seg, "farmer__admin_level_3")); wave=ke_wave(sub_time)
        farmer_id=_s(pick(seg, "farmer__sol_beneficiary_id"))
        transport_raw=dec("transfer_the_trees", pick(seg, "transfer_the_trees"))
        # explode species repeat
        rep=r.get("survival_rate") or []
        tot=dict(collected=0.0,planted=0.0,not_planted=0.0,alive=0.0,dead=0.0,missing=0.0)
        seen=set(); flags=[]
        for i,sp_ in enumerate(rep):
            g={k:v for k,v in sp_.items()}
            c=_num(pick(g, "amount_species_collected")); p=_num(pick(g, "amount_species_planted"))
            npd=_num(pick(g, "amount_species_notplanted")); al=_num(pick(g, "amount_species_healthy"))
            de=_num(pick(g, "amount_species_dead")); mi=_num(pick(g, "amount_species_missing"))
            al,spr,_,fl=_clip_counts(c,p,npd,al,de,mi)
            spname=dec("species_name", pick(g, "species_name"))
            species.append(dict(
                cohort="KE_SAVE", submission_kobo_id=sid, species_idx=i, species=spname,
                collected=c, planted=p, not_planted=npd, alive=al, dead=de, missing=mi,
                surv_planted=spr, tree_height=dec("tree_height",pick(g, "tree_height")),
                tree_health=dec("tree_health",pick(g, "tree_health")),
                reason_death=_s(pick(g, "reason_species_death")),
                reason_death_bucket=death_bucket(pick(g, "reason_species_death")),
                admin3=admin3, cooperative=coop, monitoring_wave=wave, submitted_at=sub_time))
            for k,v in dict(collected=c,planted=p,not_planted=npd,alive=al,dead=de,missing=mi).items():
                if v is not None: tot[k]+=v
            if spname: seen.add(spname)
        alive_b,sp_b,sc_b,fl2=_clip_counts(tot["collected"],tot["planted"],tot["not_planted"],tot["alive"],tot["dead"],tot["missing"])
        lookup_ok=farmer_id is not None
        if not lookup_ok: flags.append("farmer_lookup_failed")
        if gib is False: flags.append("geo_out_of_bounds")
        if lat is None: flags.append("gps_missing")
        batch.append(dict(
            cohort="KE_SAVE", kobo_id=sid, uuid=r.get("_uuid"), submitted_at=sub_time, country="Kenya",
            district=None, admin2=_s(pick(seg, "farmer__admin_level_2")), admin3=admin3,
            village=_s(pick(seg, "farmer__village")), cooperative=coop,
            farmer_ref=_s(pick(seg, "farmer_ref_no")), farmer_id=farmer_id, farmer_gender=None,
            farmer_total_seedlings=_num(pick(seg, "farmer__total_seedlings")), farmer_lookup_ok=lookup_ok,
            species_taken=dec("tree_species_received", pick(seg, "tree_species_received"), multi=True),
            transport_raw=transport_raw, transport_clean=transport_bucket(transport_raw),
            growth_perception=dec("region_growth_comparison", pick(seg, "region_growth_comparison")),
            had_challenges=dec("chall", pick(seg, "chall")),
            challenges=dec("challenges_in_planting", pick(seg, "challenges_in_planting"), multi=True),
            training_received=dec("training", pick(seg, "training")),
            collected=tot["collected"] or None, planted=tot["planted"] or None,
            not_planted=tot["not_planted"] or None, alive=alive_b, dead=tot["dead"] or None,
            missing=tot["missing"] or None, surv_planted=sp_b, surv_collected=sc_b,
            n_species=len(seen), lat=lat, lon=lon, geo_in_bounds=gib, monitoring_wave=wave,
            enumerator=_s(pick(seg, "enumerator_names")),
            crops_grown=dec("crops_grown", pick(seg, "crops_grown"), multi=True),
            crop_failure=dec("crop_failure", pick(seg, "crop_failure")),
            forest_cover_increase=dec("forest_cover_increase", pick(seg, "forest_cover_increase")),
            soil_quality_improvement=dec("soil_quality_improvement", pick(seg, "soil_quality_improvement")),
            biodiversity_evidence=dec("biodiversity_evidence", pick(seg, "biodiversity_evidence")),
            deforestation_reduction=dec("deforestation_reduction", pick(seg, "deforestation_reduction")),
            economic_benefits_products=dec("economic_benefits_products", pick(seg, "economic_benefits_products")),
            livelihood_benefit=dec("livelihood_benefit", pick(seg, "livelihood_benefit"), multi=True),
            coffee_received=None, coffee_planted=None, coffee_alive=None,
            dq_flags=",".join(flags) or None))
    return batch, species

def run(ddir=DDIR):
    f1=json.load(open(os.path.join(ddir,"form1_raw.json"),encoding="utf-8"))
    f1=f1["results"] if isinstance(f1,dict) and "results" in f1 else f1
    f2=json.load(open(os.path.join(ddir,"form2_raw.json"),encoding="utf-8"))
    f2=f2["results"] if isinstance(f2,dict) and "results" in f2 else f2
    fdef=json.load(open(os.path.join(ddir,"form2_formdef.json"),encoding="utf-8"))
    b1=transform_form1(f1)
    b2,sp2=transform_form2(f2,fdef)
    batch=b1+b2
    json.dump(batch, open(os.path.join(ddir,"clean_submissions.json"),"w",encoding="utf-8"), default=str)
    json.dump(sp2, open(os.path.join(ddir,"clean_species.json"),"w",encoding="utf-8"), default=str)
    return batch, sp2

if __name__=="__main__":
    b,s=run()
    ug=[x for x in b if x["cohort"]=="UG_HC"]; ke=[x for x in b if x["cohort"]=="KE_SAVE"]
    print(f"batch: {len(b)} (UG {len(ug)}, KE {len(ke)}) | species: {len(s)}")
    lk_ug=sum(1 for x in ug if x["farmer_lookup_ok"])/len(ug)
    lk_ke=sum(1 for x in ke if x["farmer_lookup_ok"])/len(ke)
    print(f"farmer_lookup_ok: UG {lk_ug:.1%}, KE {lk_ke:.1%}")
    print(f"UG survival(pooled)={sum(x['alive'] or 0 for x in ug)/sum(x['planted'] or 0 for x in ug):.3f}")
    print(f"KE survival(pooled)={sum(x['alive'] or 0 for x in ke)/sum(x['planted'] or 0 for x in ke):.3f}")
    print("sample dq_flags:", [x['dq_flags'] for x in b if x['dq_flags']][:5])
