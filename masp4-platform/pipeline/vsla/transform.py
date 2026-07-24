"""
VSLA Performance Assessment — canonical transform.

Reads raw Kobo JSON (vsla_raw.json + vsla_formdef.json) and produces the clean,
normalized record sets consumed by BOTH the Supabase loader and the dashboard
builder, so the two can never diverge:

    groups       -> vsla_groups        (one row per submission: identity/geo/dates)
    metrics      -> vsla_metrics        (one row per submission: numeric/categorical
                                         facts + derived KPIs; rates kept raw+cleaned)
    qualitative  -> vsla_qualitative    (one row per submission x free-text field,
                                         rule-based theme + keyword tags + sensitivity)

DEFENSIVE cleaning is baked in here (DQ handled in the pipeline, not at source):
  * group-prefix-robust field access — Kobo prefixes data columns with the survey
    group ('group_uh3oi66__What_is_the_total_group_savings'); pick() matches on the
    '__'-separated suffix.
  * select_one codes decoded to labels from the form definition. Booleans are decoded
    FIRST (some lists encode "No" as the code 'option_2', not 'no') then interpreted.
  * rate fields (repayment/interest/default/welfare %) validated: a value outside
    [0,100] is treated as a data-entry error (e.g. a default "rate" of 300000 UGX),
    nulled in the cleaned column and surfaced via dq_flags — never silently trusted.
  * per-row dq_flags surfaced, never dropped; blank qualitative answers are skipped,
    never fatal.

The programme is Uganda (ICAM/UCLAP VSLAs — parishes/sub-counties, UGX); the form has
no country field, so country is set to the constant 'Uganda' (documented, not inferred
per-row).
"""
import os, json, re, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DDIR = os.environ.get("VSLA_DATA_DIR", os.path.join(HERE, "data"))
FORM_UID = os.environ.get("VSLA_FORM_UID", "ahxgJ6SKAgF2Pz5tBWC4kp")
COUNTRY = "Uganda"
LEADERSHIP_SIZE = 8   # VSLA leadership = 8 roles (chair, secretary, treasurer, 2 counters, 3 keyholders)

# ---------------------------------------------------------------- helpers
def pick(d, fn):
    """Group-prefix-robust field access. Kobo prefixes each data column with the
    survey group path joined by '__' (group_uh3oi66__What_is_the_total_group_savings).
    Match on the '__'-separated suffix (field names contain '_' but the group join is
    '__', and question suffixes here are unique)."""
    if fn in d:
        return d[fn]
    s1, s2 = "__" + fn, "/" + fn
    for k, v in d.items():
        if k.endswith(s1) or k.endswith(s2):
            return v
    return None

def _s(v):
    return v.strip() if isinstance(v, str) and v.strip() else None

def _num(v):
    try:
        if v in (None, ""):
            return None
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None

def _int(v):
    n = _num(v)
    return int(round(n)) if n is not None else None

def humanize(code):
    return code.replace("_", " ").strip().capitalize() if isinstance(code, str) else code

# known sub-county spelling variants -> canonical (data-entry variants of one place)
SUBCOUNTY_CANON = {"ndugutu": "Nduguto"}

def canon_subcounty(v):
    s = _s(v)
    if not s:
        return None
    return SUBCOUNTY_CANON.get(s.strip().lower(), s)

def parse_date(v):
    s = _s(v)
    if not s:
        return None
    try:
        return datetime.date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return None

# ---------------------------------------------------------------- decoder
def build_decoder(formdef):
    """decode(field,val) maps a choice code to its label using the form definition."""
    lists = {}
    for ch in formdef.get("choices", []):
        lab = ch.get("label")
        lab = lab[0] if isinstance(lab, list) and lab else lab
        lists.setdefault(ch["list_name"], {})[ch["name"]] = lab or humanize(ch["name"])
    field_list = {r["name"]: r["select_from_list_name"] for r in formdef.get("survey", [])
                  if r.get("name") and r.get("select_from_list_name")}

    def decode(field, val):
        if not isinstance(val, str) or not val:
            return val
        return lists.get(field_list.get(field), {}).get(val, humanize(val))
    return decode

_TRUE = {"yes", "y", "1", "true"}
_FALSE = {"no", "n", "0", "false", "option_2", "option 2"}

def yesno(label_or_code):
    """Interpret a decoded label OR a raw code as a tri-state boolean.
    Robust to lists that encode No as 'option_2'."""
    if label_or_code is None:
        return None
    v = str(label_or_code).strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    if v.startswith("yes"):
        return True
    if v.startswith("no"):
        return False
    return None

def clean_rate(v):
    """(cleaned, out_of_range_flag). A value outside [0,100] is a data-entry error
    (e.g. an absolute UGX amount typed into a 'rate' field) -> null + flag."""
    n = _num(v)
    if n is None:
        return (None, False)
    if 0 <= n <= 100:
        return (round(n, 2), False)
    return (None, True)

def pct(numer, denom):
    if numer is None or not denom:
        return None
    return round(100.0 * numer / denom, 1)

def months_between(d_from, d_to):
    if not (d_from and d_to):
        return None
    try:
        a = datetime.date.fromisoformat(d_from)
        b = datetime.date.fromisoformat(d_to)
    except ValueError:
        return None
    return round((b - a).days / 30.4375, 1)

# ================================================================= qualitative
# Field (bare question name) -> (theme, sensitive). Sensitive fields hold GBV /
# welfare-attributable content and must be shown aggregated / non-attributable only.
QUAL_FIELDS = {
    "and_why":                                   ("dropout", False),
    "_26a_and_why":                              ("savings_reduction", False),
    "If_yes_is_the_const_al_language_explain":   ("governance", False),
    "If_not_explain_why":                        ("governance", False),
    "_10c_Which_positions_are_filled":           ("governance", False),
    "_What_checks_and_ba_revent_mismanagement":  ("governance_controls", False),
    "_What_is_the_male_t_io_of_the_leadership":  ("leadership_ratio", False),
    "_What_criteria_do_y_ase_on_to_give_loans":  ("loan_criteria", False),
    "_Are_interest_rates_fair_and_transparent":  ("transparency", False),
    "_What_internal_cont_ent_fraud_and_errors":  ("fraud_controls", False),
    "If_yes_how_is_the_fund_managed":            ("fund_management", False),
    "and_who_participates_g_women_men_youth":    ("fund_governance", False),
    "_What_types_of_need_nd_typically_address":  ("welfare_use", False),
    "_Are_there_specific_type_of_grievances":    ("gbv_welfare", True),
    "Please_provide_a_bre_nd_age_if_available":  ("welfare_beneficiary_profile", True),
    "_What_type_of_enter_he_loans_and_savings":  ("business_types", False),
    "If_yes_What_is_the_plan":                   ("growth_plan", False),
    "If_yes_What_training":                       ("training", False),
    "_Name_community_bas_LA_collaborates_with":  ("linkage", False),
    "_What_systems_are_i_cial_or_social_risks":  ("risk_mitigation", False),
    "_How_does_the_VSLA_efaults_or_conflicts":   ("conflict_handling", False),
    "_What_changes_do_me_hin_their_households":  ("gender_household", True),
    "_What_changes_do_me_economic_empowerment":  ("gender_empowerment", False),
    "_What_changes_do_me_s_loans_and_savings":   ("gender_spousal", False),
    "If_yes_please_specify":                      ("collective_assets", False),
}

# Lightweight rule-based keyword buckets (small N; revisit with embeddings if volume grows).
KEYWORD_TAGS = [
    ("death",              ["death", "burial", "funeral", "bereave", "died", "deceased"]),
    ("illness",            ["illness", "sick", "sickness", "health", "medical", "hospital", "disease"]),
    ("school_fees",        ["school", "fees", "education", "tuition", "scholastic"]),
    ("business",           ["business", "income generat", "enterprise", "trade", "trading", "capital", "investment"]),
    ("agriculture",        ["cocoa", "coffee", "farm", "crop", "garden", "agric", "goat", "livestock", "fish", "tomato", "banana"]),
    ("gbv",                ["violence", "gbv", "gender based", "gender-based", "abuse", "domestic"]),
    ("cohesion",           ["unity", "cooperat", "coperation", "together", "peace", "relationship", "bonding", "harmony"]),
    ("emergency",          ["emergency", "accident", "disaster", "crisis", "shock"]),
    ("attendance",         ["absent", "absentee", "attendance", "attend", "turn up"]),
    ("relocation",         ["transfer", "relocat", "moved", "migrat", "shifted"]),
    ("conflict",           ["conflict", "dispute", "disagree", "quarrel", "misunderstand"]),
    ("land",               ["land", "plot", "acre", "property"]),
    ("recordkeeping",      ["record", "ledger", "legger", "passbook", "pass book", "log book", "minutes", "book keep"]),
    ("empowerment",        ["empower", "access and control", "decision", "resource", "voice"]),
    ("no_response",        ["n/a", "n.a", "none", "not applicable", "nil"]),
]
_GBV_WORDS = ("violence", "gbv", "gender based", "gender-based", "abuse", "domestic")

def _tag(text):
    t = text.lower()
    tags = [name for name, kws in KEYWORD_TAGS if any(k in t for k in kws)]
    return tags

def _is_blank(text):
    return text.strip().lower() in ("", "n/a", "n.a", "n.a.", "na", "none", "nil",
                                    "not applicable", "-", ".", "no", "n\\a")

# ================================================================= transform
def transform(records, formdef):
    decode = build_decoder(formdef)
    groups, metrics, qualitative = [], [], []

    for r in records:
        seg = {k: v for k, v in r.items() if not isinstance(v, (list, dict))}
        kid = r.get("_id")
        sub_time = r.get("_submission_time")
        flags = []

        def g(fn):                       # raw string value
            return pick(seg, fn)
        def gnum(fn):
            return _num(pick(seg, fn))
        def gint(fn):
            return _int(pick(seg, fn))
        def b(fn):                       # decode-aware tri-state boolean
            return yesno(decode(fn, pick(seg, fn)))

        # ---- identity / geography / dates ----
        formation = parse_date(g("Date_of_formation_start_date"))
        assessment = parse_date(g("Date_of_the_assessment"))
        collection = parse_date(g("Data_of_the_data_collection"))
        group_age = months_between(formation, assessment)
        group_name = _s(g("Name_of_VSLA_Group"))
        if not group_name:
            flags.append("group_name_missing")
        if not (assessment or collection):
            flags.append("assessment_date_missing")

        groups.append(dict(
            kobo_id=kid, uuid=r.get("_uuid"), submitted_at=sub_time,
            enumerator=_s(g("Enumerator_Name_staff")), collection_date=collection,
            group_name=group_name, country=COUNTRY,
            sub_county=canon_subcounty(g("Sub_county")), parish=_s(g("Parish")), village=_s(g("Village")),
            formation_date=formation, assessment_date=assessment, group_age_months=group_age,
            dq_flags=None))   # filled at end of loop

        # ---- membership & inclusion ----
        members_formation = gint("_How_many_members_w_he_VSLA_at_formation")
        members_active = gint("_How_many_members_a_y_active_in_the_VSLA")
        active_female = gint("b_Female_001")
        active_youth = gint("c_youth_001")
        active_pwd = gint("d_PWD_001")
        members_dropped = gint("_How_many_members_d_ter_the_first_Cycle_")

        # ---- governance ----
        leadership_8 = b("_Is_the_VSLA_leader_s_and_3_key_holders")
        positions_filled = gint("_10b_If_not_how_man_positions_are_filled")
        women_leaders = gint("If_yes_How_many_")
        youth_leaders = gint("If_yes_How_many__001")
        gov_keys = {
            "has_constitution": b("_Does_the_VSLA_have_a_final_w"),
            "leadership_8_complete": leadership_8,
            "clear_roles": b("_Are_there_clear_ro_or_committee_members"),
            "roles_defined": b("_Are_roles_Chairpe_etc_clearly_defined"),
            "responsibilities_understood": b("_Are_responsibiliti_by_committee_members"),
            "meetings_documented": b("_Are_meetings_condu_larly_and_documented"),
            "minutes_stored": b("_Are_minutes_record_and_stored_properly"),
            "secret_ballot": b("_Does_your_group_s_election_p"),
        }
        gov_answered = [v for v in gov_keys.values() if v is not None]
        governance_score = round(100.0 * sum(1 for x in gov_answered if x) / len(gov_answered), 1) if gov_answered else None

        # ---- savings & loans (rates cleaned/flagged) ----
        total_savings = gnum("_What_is_the_total_group_savings")
        total_loans = gnum("_Total_in_loans_disbursed_out")
        repay_c, repay_flag = clean_rate(g("_What_is_the_repaym_the_loans_given_out"))
        int_c, int_flag = clean_rate(g("_What_is_the_intere_the_loans_given_out"))
        def_c, def_flag = clean_rate(g("_What_is_the_defaul_the_loans_given_out"))
        wpct_c, wpct_flag = clean_rate(g("_What_percentage_of_social_welfare_fund"))
        if repay_flag: flags.append("repayment_rate_out_of_range")
        if int_flag:   flags.append("interest_rate_out_of_range")
        if def_flag:   flags.append("default_rate_out_of_range")
        if wpct_flag:  flags.append("welfare_pct_out_of_range")

        # ---- outcomes / sustainability ----
        covers_costs = b("_Is_the_VSLA_coveri_s_through_its_income")
        can_operate = b("_Can_the_VSLA_conti_out_external_support")
        self_sufficient = (covers_costs and can_operate) if (covers_costs is not None and can_operate is not None) else None

        # ---- derived KPIs ----
        retention = pct(members_active, members_formation)
        leadership_completeness = (100.0 if leadership_8 is True
                                   else pct(positions_filled, LEADERSHIP_SIZE))
        m = dict(
            group_kobo_id=kid,
            members_formation=members_formation, form_male=gint("a_Male"),
            form_female=gint("b_Female"), form_youth=gint("c_youth"), form_pwd=gint("d_PWD"),
            members_active=members_active, active_male=gint("a_Male_001"),
            active_female=active_female, active_youth=active_youth, active_pwd=active_pwd,
            members_dropped=members_dropped, avg_member_age=gnum("_What_is_the_average_age_of_the_members"),
            meeting_frequency=_s(g("_How_often_do_members_attend_meetings")),
            active_participation=b("_Are_members_partic_and_decision_making"),
            received_fin_training=b("_Have_members_recei_and_loan_management"),
            linked_fin_institution=b("_Is_your_VSLA_group_currently"),
            has_constitution=gov_keys["has_constitution"], leadership_8_complete=leadership_8,
            positions_filled=positions_filled, clear_roles=gov_keys["clear_roles"],
            roles_defined=gov_keys["roles_defined"],
            responsibilities_understood=gov_keys["responsibilities_understood"],
            meetings_documented=gov_keys["meetings_documented"], minutes_stored=gov_keys["minutes_stored"],
            women_in_leadership=b("_Are_there_women_in_leadershi"), women_leaders_count=women_leaders,
            youth_in_leadership=b("_Are_there_youth_in_the_leade"), youth_leaders_count=youth_leaders,
            secret_ballot=gov_keys["secret_ballot"], quorum_min=gint("If_yes_what_is_the_rocess_to_take_place"),
            total_savings=total_savings, share_value=gnum("_What_is_a_share_of_the_VSLA_group"),
            savings_frequency=decode("_How_frequently_do_you_contri", g("_How_frequently_do_you_contri")),
            avg_savings_per_member=gnum("_What_is_the_averag_f_savings_per_member"),
            members_increased_savings=gint("_How_many_members_i_fter_the_first_cycle"),
            members_reduced_savings=gint("_How_many_members_r_hare_savings_and_why"),
            avg_savings_increase=gnum("_How_much_is_the_in_on_average_over_time"),
            total_loans_disbursed=total_loans, avg_loan=gnum("_What_is_the_averag_o_members_on_average"),
            repayment_rate_raw=_num(g("_What_is_the_repaym_the_loans_given_out")), repayment_rate=repay_c,
            interest_rate_raw=_num(g("_What_is_the_intere_the_loans_given_out")), interest_rate=int_c,
            default_rate_raw=_num(g("_What_is_the_defaul_the_loans_given_out")), default_rate=def_c,
            has_welfare_fund=b("_Does_your_VSLA_group_allocat"),
            welfare_fund_total=gnum("_What_is_the_total_social_welfare_fund"),
            welfare_pct_raw=_num(g("_What_percentage_of_social_welfare_fund")), welfare_pct=wpct_c,
            welfare_frequency=decode("_Is_the_social_welf_ed_weekly_or_monthly", g("_Is_the_social_welf_ed_weekly_or_monthly")),
            welfare_weekly=gnum("If_yes_how_much_doe_r_contribute_Weekly"),
            welfare_monthly=gnum("If_yes_how_much_doe_contribute_Monthly"),
            welfare_beneficiaries=gint("_How_many_members_h_since_its_inception"),
            welfare_hh_eligible=gint("_How_many_household_social_welfare_fund"),
            welfare_contrib_increased=b("Please_list_them_and_indicate_"),
            helped_access_financial=b("_Has_the_VSLA_helped_members_"),
            increased_member_savings=b("_Has_the_VSLA_led_to_increase"),
            increased_group_savings=b("_Has_there_been_an_ase_in_group_savings"),
            group_savings_increase_amt=gnum("By_how_much"),
            strengthened_social=b("_Has_the_VSLA_strengthened_so"),
            members_started_business=gint("_How_many_members_i_e_savings_and_loans_"),
            covers_operational_costs=covers_costs, can_operate_without_support=can_operate,
            has_growth_plan=b("_Does_the_VSLA_have_growth_and_expansion"),
            has_sustainability_strategy=b("_Does_the_VSLA_have_term_sustainability"),
            ongoing_training=b("_Are_members_and_leaders_rece"),
            n_spinoff_vslas=gint("_How_many_other_VSL_t_of_this_VSLA_group"),
            has_champions=b("_Does_the_VSLA_have_members_in_the_group"),
            govt_collaboration=b("_Does_the_VSLA_have_ith_local_government"),
            benefits_pdm=b("_Does_the_VSLA_bene_sh_development_model"),
            has_bank_account=b("_Has_the_VSLA_opened_up_a_bank_account"),
            formally_registered=b("_Has_your_VSLA_grou_formally_registered"),
            gals_trained=b("_Were_members_train_cussion_group_series"),
            collective_assets=b("_Do_VSLA_members_report_ownin"),
            spousal_collaboration=b("_Are_there_VSLA_members_who_t"),
            spousal_collab_count=gint("If_yes_how_many_mem_s_have_reported_this"),
            retention_rate=retention,
            pct_female_active=pct(active_female, members_active),
            pct_youth_active=pct(active_youth, members_active),
            pct_pwd_active=pct(active_pwd, members_active),
            leadership_completeness=leadership_completeness,
            pct_women_leadership=pct(women_leaders, LEADERSHIP_SIZE),
            governance_score=governance_score,
            savings_per_member_calc=(round(total_savings / members_active, 1)
                                     if (total_savings is not None and members_active) else None),
            loan_to_savings_ratio=(round(total_loans / total_savings, 3)
                                   if (total_loans is not None and total_savings) else None),
            self_sufficient=self_sufficient,
            dq_flags=None)

        # membership sanity flags
        if members_formation and members_active and members_active > members_formation * 3:
            flags.append("active_gt_formation_outlier")
        if members_active is None:
            flags.append("active_members_missing")

        # ---- qualitative (theme + keyword tags + sensitivity) ----
        for fn, (theme, sensitive) in QUAL_FIELDS.items():
            txt = _s(g(fn))
            if not txt or _is_blank(txt):
                continue
            tags = _tag(txt)
            is_sensitive = bool(sensitive or any(w in txt.lower() for w in _GBV_WORDS))
            qualitative.append(dict(
                group_kobo_id=kid, field_name=fn,
                question_label=QUESTION_LABELS.get(fn, humanize(fn)),
                theme=theme, tags=",".join(tags) or None,
                sensitive=is_sensitive, response_text=txt))

        m["dq_flags"] = ",".join(flags) or None
        groups[-1]["dq_flags"] = ",".join(flags) or None
        metrics.append(m)

    return dict(groups=groups, metrics=metrics, qualitative=qualitative)


# human question labels for the qualitative panel (kept out of the loop for clarity)
QUESTION_LABELS = {
    "and_why": "Why did members drop out after the first cycle?",
    "_26a_and_why": "Why did members reduce their share savings?",
    "If_yes_is_the_const_al_language_explain": "Constitution language",
    "If_not_explain_why": "Why is leadership not fully composed?",
    "_10c_Which_positions_are_filled": "Which leadership positions are filled?",
    "_What_checks_and_ba_revent_mismanagement": "Checks & balances against mismanagement",
    "_What_is_the_male_t_io_of_the_leadership": "Male-to-female ratio of leadership",
    "_What_criteria_do_y_ase_on_to_give_loans": "Loan eligibility criteria",
    "_Are_interest_rates_fair_and_transparent": "Are interest rates fair & transparent?",
    "_What_internal_cont_ent_fraud_and_errors": "Internal controls against fraud/errors",
    "If_yes_how_is_the_fund_managed": "How is the social welfare fund managed?",
    "and_who_participates_g_women_men_youth": "Who participates in fund decision-making?",
    "_What_types_of_need_nd_typically_address": "Needs the welfare fund addresses",
    "_Are_there_specific_type_of_grievances": "Provisions for gender-related / GBV needs",
    "Please_provide_a_bre_nd_age_if_available": "Welfare beneficiary profile (gender/age)",
    "_What_type_of_enter_he_loans_and_savings": "Enterprises started with loans/savings",
    "If_yes_What_is_the_plan": "Growth & expansion plan",
    "If_yes_What_training": "Ongoing training received",
    "_Name_community_bas_LA_collaborates_with": "Community-based organisations collaborated with",
    "_What_systems_are_i_cial_or_social_risks": "Systems to identify/mitigate risks",
    "_How_does_the_VSLA_efaults_or_conflicts": "How the VSLA handles defaults/conflicts",
    "_What_changes_do_me_hin_their_households": "Changes in household decision-making",
    "_What_changes_do_me_economic_empowerment": "Changes in access to productive resources",
    "_What_changes_do_me_s_loans_and_savings": "Changes in spousal support for businesses",
    "If_yes_please_specify": "Collectively owned assets",
}


def run(ddir=DDIR):
    recs = json.load(open(os.path.join(ddir, "vsla_raw.json"), encoding="utf-8"))
    recs = recs["results"] if isinstance(recs, dict) and "results" in recs else recs
    fdef = json.load(open(os.path.join(ddir, "vsla_formdef.json"), encoding="utf-8"))
    out = transform(recs, fdef)
    for name, rows in out.items():
        json.dump(rows, open(os.path.join(ddir, f"clean_{name}.json"), "w", encoding="utf-8"), default=str)
    return out


if __name__ == "__main__":
    o = run()
    g, m, q = o["groups"], o["metrics"], o["qualitative"]
    print(f"groups: {len(g)} | metrics: {len(m)} | qualitative: {len(q)}")
    from collections import Counter
    print("by sub_county:", dict(Counter(x["sub_county"] for x in g)))
    print("qual themes:", dict(Counter(x['theme'] for x in q)))
    print("sensitive qual rows:", sum(1 for x in q if x["sensitive"]))
    flagged = [x["dq_flags"] for x in m if x["dq_flags"]]
    print(f"rows with dq_flags: {len(flagged)} / {len(m)}")
    print("sample flags:", [f for f in flagged[:8]])
    # rate sanity spot-check
    print("repayment_rate (raw->clean):", [(x["repayment_rate_raw"], x["repayment_rate"]) for x in m][:6])
    print("default_rate  (raw->clean):", [(x["default_rate_raw"], x["default_rate"]) for x in m][:6])
