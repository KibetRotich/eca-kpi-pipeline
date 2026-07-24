"""Build variable dictionaries for both forms, flag misleading auto-names."""
import json
import pandas as pd

def load(fn): return json.load(open(f"data/{fn}", encoding="utf-8"))

# ---- Form 2: auto from XLSForm definition ----
f2def = load("form2_formdef.json")
lists = {}
for ch in f2def["choices"]:
    lists.setdefault(ch["list_name"], []).append((ch["name"], (ch.get("label") or [""])[0]))
rows, grp = [], []
for r in f2def["survey"]:
    t = r.get("type","")
    if t in ("begin_group","begin_repeat"):
        grp.append(r.get("name","")); continue
    if t in ("end_group","end_repeat"):
        if grp: grp.pop()
        continue
    nm = r.get("name")
    if not nm or t in ("start","end","note","image"): continue
    ln = r.get("select_from_list_name")
    choices = "; ".join(f"{c}={l}" for c,l in lists.get(ln,[])) if ln else ""
    rows.append(dict(form="Form2_KE", group="/".join(grp), name=nm, type=t,
                     label=(r.get("label") or [""])[0], choice_list=ln or "",
                     choices=choices[:400],
                     in_repeat="Y" if "survival_rate" in grp or "photo_section" in grp else ""))
f2dict = pd.DataFrame(rows)
f2dict.to_csv("out/dict_form2.csv", index=False)

# ---- Form 1: curated from get_form_content (id Harvesting_Carbon_Tree_Survival_Assessment_v26_02_21) ----
# (name, type, group, label, choice_list)
F1 = [
("What_type_of_data_ar_you_proceeding_with","select_one","intro","What type of data are you proceeding with?","wf5sr45"),
("Confidentiality_You_e_with_the_interview","select_one","intro","Consent to participate","cz9gr18"),
("Record_your_current_location","geopoint","intro","Record your current location (GPS at TOP of form)",""),
("district","select_one","Farmer Details","Select the district of the farmer","districts"),
("farmer_ref","select_one_from_file","Farmer Details","Type Farmer Name or ID (lookup vs hc_seedlings_dist_20260329.csv)",""),
("__farmer_code","calculate","Farmer Details","[calc] farmer code from registry",""),
("__farmer_names","calculate","Farmer Details","[calc] farmer names from registry",""),
("__farmer_gender","calculate","Farmer Details","[calc] farmer gender from registry",""),
("__farmer_phone_number","calculate","Farmer Details","[calc] farmer phone from registry",""),
("__farmer_village","calculate","Farmer Details","[calc] farmer subcounty/village from registry",""),
("__farmer_total_seedlings","calculate","Farmer Details","[calc] total seedlings issued from registry",""),
("Did_you_receive_any_participated_in_all","select_one","Tree Planting Progress","Did you receive seedlings in all distributions?","lm29x27"),
("Why_did_you_not_coll_ssued_by_Solidaridad","text","Tree Planting Progress","Why not collect in all distributions?",""),
("How_many_tree_seedli_if_he_she_remembers","text","Tree Planting Progress","Cumulative seedlings received since first distribution (FREE-TEXT RECALL)",""),
("What_type_of_tree_sp_edlings_distribution","select_multiple","Tree Planting Progress","Tree species taken/received","cr7bx40"),
("Kindly_specify_the_o_species_you_received","text","Tree Planting Progress","Other species specify",""),
("How_did_you_transfer_g_after_distribution","select_one","Tree Planting Progress","Transport pickup->farm","hq8dw06"),
("How_does_the_trees_g_rate_for_the_region","select_one","Tree Planting Progress","Growth vs expected regional rate (perception)","ll2zu80"),
("What_is_your_reason_for_the_growth_rate","text","Tree Planting Progress","Reason for growth rate",""),
("Were_there_any_chall_n_planting_the_trees","select_one","Tree Planting Progress","Any planting challenges?","pv4ry50"),
("What_type_of_challen_n_planting_the_trees","select_multiple","Tree Planting Progress","Type of planting challenges","wt2zn18"),
("Kindly_specify_any_o_e_planting_the_trees","text","Tree Planting Progress","Other challenge specify",""),
("Select_specific_type_eedling_distribution","select_multiple","Tree Survival Rate","Specific species for survival count","jv6sv20"),
("How_many_total_seedl_participated_in_both","integer","Tree Survival Rate","Total seedlings COLLECTED for planting",""),
("How_many_seedlings_did_you_plant","integer","Tree Survival Rate","Seedlings PLANTED",""),
("Are_there_any_seedli_gs_you_did_not_plant","select_one","Tree Survival Rate","Any seedlings not planted?","zi6km75"),
("How_many_seedlings_did_you_not_plant","integer","Tree Survival Rate","Seedlings NOT planted",""),
("What_was_the_main_re_he_seedling_received","text","Tree Survival Rate","Reason for not planting",""),
("How_many_seedlings_a_a_healthy_condition","integer","Tree Survival Rate","Seedlings ALIVE & healthy",""),
("What_is_the_average_ll_alive_and_healthy","select_one","Tree Survival Rate","Average tree height (alive)","th6bl59"),
("How_many_seedlings_are_dead_or_damaged","integer","Tree Survival Rate","Seedlings DEAD/damaged",""),
("What_is_the_reason_for_death_or_damage","text","Tree Survival Rate","Reason for death/damage",""),
("Have_you_replaced_an_damage_or_mortality","select_one","Tree Survival Rate","Replaced dead trees?","gm9vn59"),
("How_did_you_replace_es_that_were_damaged","text","Tree Survival Rate","How replaced",""),
("Have_the_planted_tre_e_g_droughts_pests","select_one","Tree Survival Rate","Resilience to drought/pests?","fc3gr32"),
("What_is_the_reason_f_answer_on_resilience","text","Tree Survival Rate","Reason for resilience answer",""),
("What_is_the_current_of_the_planted_Trees","select_one","Tree Survival Rate","Current health of trees","bh0dh36"),
("Which_type_of_health_features_is_showing","select_multiple","Tree Survival Rate","Healthy features","ac9oc23"),
("Which_type_of_unheal_features_is_showing","select_multiple","Tree Survival Rate","Unhealthy features","fq2gj48"),
("How_many_seedlings_did_you_receive","integer","COFFEE SEEDLINGS","COFFEE seedlings received",""),
("How_many_coffee_seedlings_did_you_plant","integer","COFFEE SEEDLINGS","Coffee seedlings planted",""),
("How_many_coffee_seed_ings_are_alive_today","integer","COFFEE SEEDLINGS","Coffee seedlings alive today",""),
("Have_you_replanted_g_ed_missing_seedlings","select_one","COFFEE SEEDLINGS","Replanted/gapped coffee?","kt7in50"),
("How_many_did_you_replace","integer","COFFEE SEEDLINGS","Coffee seedlings replaced",""),
("Overall_condition_of_seedlings","select_one","COFFEE SEEDLINGS","Overall coffee condition","mi0rm90"),
("What_measures_are_in_enance_of_the_trees_","select_multiple","Maintenance","Maintenance measures","pw7py03"),
("Have_you_received_an_roforestry_practices","select_one","Additional comments","Received training/capacity building?","rs4ap51"),
("From_which_organisat_building_activities","select_multiple","Additional comments","Training organisation","oc88e31"),
("What_additional_supp_forestry_sustainably","select_multiple","Additional comments","Additional support needed","wx4sq11"),
("Kindly_take_photos_o_till_the_last_photo","image","Photo Section (repeat)","Photos of monitored trees",""),
("Species_name","text","Photo Section (repeat)","Species name (per-photo free-text caption)",""),
("Do_you_have_any_other_observable_comment","select_one","Enumerator Comments","Any observable comment?","tl4iv58"),
("Enumerator_names","select_one","Enumerator Comments","Enumerator names","lg8ke48"),
]
f1dict = pd.DataFrame(F1, columns=["name","type","group","label","choice_list"])
f1dict.insert(0,"form","Form1_UG")
f1dict.to_csv("out/dict_form1.csv", index=False)

# ---- Misleading / garbled auto-name flags ----
flags = [
("Form1","How_many_seedlings_did_you_receive","Generic name but sits in COFFEE SEEDLINGS group -> it is COFFEE received, NOT total tree seedlings. Easy to mis-map."),
("Form1","How_many_tree_seedli_if_he_she_remembers","TYPE = text (free recall), not the integer count. The real collected count is 'How_many_total_seedl_participated_in_both'."),
("Form1","Species_name","In Photo Section repeat = a per-photo free-text caption, NOT structured per-species survival data. Do not treat as species grain."),
("Form1","Select_specific_type_eedling_distribution","Truncated auto-name; a SECOND species select_multiple that duplicates 'What_type_of_tree_sp...'. Survival counts are batch-level, not tied to this."),
("Form1","How_many_seedlings_a_a_healthy_condition","Garbled truncation of 'are still alive and in a healthy condition' = ALIVE count."),
("Form1","What_is_the_average_ll_alive_and_healthy","Garbled truncation; label = average tree HEIGHT of alive trees (not a count)."),
("Form1","Did_you_receive_any_participated_in_all","Truncated; = received seedlings during ALL distributions (yes/no)."),
("Form2","Has_species_name_p_ronmental_conditions","Repeat field auto-name; = resilience of ${species_name} to environmental conditions."),
("Form2","first_seed_num / total_seedlings_received","Batch cumulative received; distinct from per-species amount_species_collected inside the repeat."),
("Form2","farmer__admin_level_2 / _3","Geography comes ONLY from the registry lookup (no district question on the form). Blank if farmer lookup failed."),
]
pd.DataFrame(flags, columns=["form","field","issue"]).to_csv("out/dict_misleading_flags.csv", index=False)

print("Form1 dict rows:", len(f1dict), "| Form2 dict rows:", len(f2dict))
print("Misleading flags:", len(flags))
print("\n--- Form2 groups ---")
print(f2dict.groupby("group").size().to_string())
