"""
Build the self-contained VSLA Performance Assessment dashboard:

    public/VSLA_Performance_Dashboard.html

Bakes a straightforward per-group dataset (identity + metrics + tagged qualitative
excerpts) into dashboard_template.html so all nine tabs recompute live under the
global filters, entirely client-side (Chart.js, no runtime backend). transform.run()
is the single source of cleaning logic, shared with the Supabase loader, so the
dashboard and the database never diverge. Currency is UGX (Ugandan Shillings).

Tabs: Overview · Membership & Inclusion · Governance · Savings & Loans ·
      Social Welfare Fund · Institutional Linkage · Outcomes & Sustainability ·
      Qualitative Insights · Geography.

Also writes pipeline/vsla/data/vsla_group_metrics.csv (one row per group, key
metrics + dq_flags) — written to a file, never echoed row-by-row.
"""
import os, csv, json
import transform

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TEMPLATE = os.path.join(HERE, "dashboard_template.html")
OUTFILE = os.path.join(REPO_ROOT, "public", "VSLA_Performance_Dashboard.html")
CSVFILE = os.path.join(HERE, "data", "vsla_group_metrics.csv")

# identity/geo/date fields carried onto each group object (rest live under .metrics)
GROUP_FIELDS = ["kobo_id", "group_name", "enumerator", "country", "sub_county",
                "parish", "village", "formation_date", "assessment_date",
                "collection_date", "group_age_months", "dq_flags"]

# per-group CSV columns (key metrics + dq_flags) — mirrors CVA's per-farmer CSV
CSV_METRICS = ["members_formation", "members_active", "members_dropped",
               "active_female", "active_youth", "active_pwd", "retention_rate",
               "pct_female_active", "pct_youth_active", "leadership_completeness",
               "governance_score", "pct_women_leadership", "total_savings",
               "avg_savings_per_member", "total_loans_disbursed", "repayment_rate",
               "default_rate", "interest_rate", "has_welfare_fund",
               "welfare_fund_total", "welfare_pct", "welfare_beneficiaries",
               "self_sufficient", "has_growth_plan", "members_started_business",
               "n_spinoff_vslas", "formally_registered", "has_bank_account"]


def write_group_csv(groups, metrics_by):
    """One row per group: identity + key metrics + dq_flags. Written to file, never
    echoed — mirrors how the CVA builder persists its per-farmer index table."""
    cols = ["kobo_id", "group_name", "sub_county", "parish", "village",
            "assessment_date", "group_age_months"] + CSV_METRICS + ["dq_flags"]
    os.makedirs(os.path.dirname(CSVFILE), exist_ok=True)
    with open(CSVFILE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for g in groups:
            m = metrics_by.get(g["kobo_id"], {})
            row = [g["kobo_id"], g["group_name"] or "", g["sub_county"] or "",
                   g["parish"] or "", g["village"] or "", g["assessment_date"] or "",
                   g["group_age_months"] if g["group_age_months"] is not None else ""]
            for k in CSV_METRICS:
                v = m.get(k)
                row.append("" if v is None else v)
            row.append(g["dq_flags"] or "")
            w.writerow(row)
    return len(groups)


def build():
    data = transform.run()
    groups, metrics, qualitative = data["groups"], data["metrics"], data["qualitative"]
    metrics_by = {m["group_kobo_id"]: m for m in metrics}
    qual_by = {}
    for q in qualitative:
        qual_by.setdefault(q["group_kobo_id"], []).append(q)

    n_csv = write_group_csv(groups, metrics_by)

    # assemble one self-contained object per group: identity + metrics + qualitative
    out_groups = []
    for g in groups:
        kid = g["kobo_id"]
        m = dict(metrics_by.get(kid, {}))
        m.pop("group_kobo_id", None)
        qs = [dict(field_name=q["field_name"], question_label=q["question_label"],
                   theme=q["theme"], tags=q["tags"], sensitive=q["sensitive"],
                   response_text=q["response_text"]) for q in qual_by.get(kid, [])]
        out_groups.append({**{k: g[k] for k in GROUP_FIELDS}, "metrics": m, "qualitative": qs})

    # lookups (arrays; the template derives the cascade from the group rows themselves)
    sub_counties = sorted({g["sub_county"] for g in groups if g["sub_county"]})
    parishes = sorted({g["parish"] for g in groups if g["parish"]})
    villages = sorted({g["village"] for g in groups if g["village"]})
    themes = sorted({q["theme"] for q in qualitative})

    dates = sorted(g["assessment_date"] for g in groups if g["assessment_date"])
    payload = dict(
        meta=dict(
            n=len(out_groups), form_uid=transform.FORM_UID, country=transform.COUNTRY,
            date_min=dates[0] if dates else "", date_max=dates[-1] if dates else "",
            n_qual=len(qualitative), n_sensitive=sum(1 for q in qualitative if q["sensitive"]),
            currency="UGX", generated=os.environ.get("VSLA_GEN", "nightly build"),
        ),
        lookups=dict(subCounties=sub_counties, parishes=parishes, villages=villages, themes=themes),
        groups=out_groups,
    )

    tpl = open(TEMPLATE, encoding="utf-8").read()
    out = tpl.replace("/*__DATA__*/", json.dumps(payload, default=str, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
    open(OUTFILE, "w", encoding="utf-8").write(out)

    n_dq = sum(1 for g in groups if g["dq_flags"])
    print(f"wrote {OUTFILE}  ({len(out)//1024} KB, {len(out_groups)} VSLA groups, "
          f"{len(qualitative)} qualitative excerpts, {payload['meta']['n_sensitive']} sensitive)")
    print(f"wrote {CSVFILE}  ({n_csv} per-group metric rows, {n_dq} with dq_flags)")


if __name__ == "__main__":
    build()
