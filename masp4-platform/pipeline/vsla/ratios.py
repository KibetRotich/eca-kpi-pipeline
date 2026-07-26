"""
VSLA performance ratios — Python port of `lib/analytics/ratios.ts`.

Renders the same ten ratios the Next.js AnalyticsPanel gets from /api/analytics,
so the static dashboard and the platform never disagree about a number.

WHY THIS CONSUMES transform.py INSTEAD OF RAW KOBO
--------------------------------------------------
`ratios.ts` reads raw Kobo rows directly, resolving Kobo's group-prefixed,
truncated column names by fuzzy substring match. Re-implementing that lookup here
would duplicate `transform.pick()` and give the divergence this pipeline exists to
prevent (see README: "transform.run() is the single source of cleaning logic").

So this module takes transform's already-cleaned `metrics` rows and maps them onto
the field names `ratios.ts` uses. Every input is the same underlying question, and
the rate fields arrive already run through `clean_rate()` — which is exactly what
`ratios.ts` does with its own `cleanRate`. The arithmetic below is a faithful
mirror; only the field-access layer differs, deliberately.

    ratios.ts field        <- transform.py metric
    members_at_formation   <- members_formation
    members_active         <- members_active
    members_dropped        <- members_dropped
    youth_active           <- active_youth
    leadership_filled      <- resolve(leadership_8_complete, positions_filled)
    women_leadership       <- women_leaders_count
    total_savings          <- total_savings
    share_value            <- share_value
    total_loans_disbursed  <- total_loans_disbursed
    default_rate           <- default_rate      (already clean_rate'd)
    swf_balance            <- welfare_fund_total

THE _10b SKIP FIX (kept in lockstep with ratios.ts)
---------------------------------------------------
The form asks "_10b If not, how many positions are filled" ONLY when a group says
its 8 leadership roles are NOT all staffed. A fully-staffed group therefore leaves
it blank or 0. Reading _10b alone scored 25 of 26 groups at 0/8 and, since
leadershipCompleteness is one of the four maturity z-score components, skewed the
composite as well. `resolve_leadership_filled()` below is the same resolution as
`resolveLeadershipFilled()` in ratios.ts and `leadership_completeness` in
transform.py.

Every ratio guards its denominator: a 0 / None divisor yields None, never a
ZeroDivisionError and never a NaN.
"""
import math

LEADERSHIP_SIZE = 8

# the four components averaged into maturityScore (order matches ratios.ts)
MATURITY_COMPONENTS = (
    "savingsMobilizationRatio",
    "leadershipCompleteness",
    "retentionRate",
    "swfRatio",
)

RATIO_KEYS = (
    "savingsMobilizationRatio",
    "loanToSavingsRatio",
    "portfolioAtRiskProxy",
    "swfRatio",
    "leadershipCompleteness",
    "genderLeadershipRatio",
    "youthInclusionRatio",
    "retentionRate",
    "growthRate",
    "maturityScore",
)


# ---------------------------------------------------------------- helpers
def _round(v, dp=4):
    """JS `Math.round(v*f)/f`, NOT Python's round().

    Python rounds halves to even (round(0.5) == 0); JS rounds halves toward +inf.
    maturityScore is signed, so the difference is observable — mirror JS exactly
    or the static HTML and /api/analytics disagree in the last decimal place.
    """
    if v is None:
        return None
    f = 10 ** dp
    return math.floor(v * f + 0.5) / f


def _div(num, den):
    """Safe division: None numerator, None denominator, or 0 denominator -> None."""
    if num is None or den is None or den == 0:
        return None
    r = num / den
    return r if math.isfinite(r) else None


def resolve_leadership_filled(complete, filled):
    """Filled leadership seats, resolving the _10b skip pattern.

    complete is True  -> all LEADERSHIP_SIZE seats filled
    complete is False -> the _10b count as answered
    complete is None  -> fall back to _10b, but treat a bare 0 as unknown, since
                         "0 of 8 seats filled" is not a real VSLA state and is far
                         more likely an unanswered skip.
    """
    if complete is True:
        return LEADERSHIP_SIZE
    if complete is False:
        return filled
    return None if (filled is None or filled == 0) else filled


def _zscore(values):
    """Population z-scores; None stays None; sd == 0 -> 0.0 (mirrors ratios.ts)."""
    present = [v for v in values if v is not None]
    if not present:
        return [None] * len(values)
    mean = sum(present) / len(present)
    variance = sum((v - mean) ** 2 for v in present) / len(present)
    sd = math.sqrt(variance)
    return [None if v is None else (0.0 if sd == 0 else (v - mean) / sd) for v in values]


# ---------------------------------------------------------------- ratios
def compute_ratios(m):
    """Ten ratios for one group from its transform.py metrics row.

    `maturityScore` is left None here — it needs the whole cohort (see
    attach_maturity_scores).
    """
    members_active = m.get("members_active")
    share_value = m.get("share_value")
    total_savings = m.get("total_savings")
    formation = m.get("members_formation")
    dropped = m.get("members_dropped")

    leadership_filled = resolve_leadership_filled(
        m.get("leadership_8_complete"), m.get("positions_filled")
    )

    expected_savings = (
        members_active * share_value
        if (members_active is not None and share_value is not None)
        else None
    )

    return dict(
        savingsMobilizationRatio=_round(_div(total_savings, expected_savings)),
        loanToSavingsRatio=_round(_div(m.get("total_loans_disbursed"), total_savings)),
        portfolioAtRiskProxy=_round(
            _div(m.get("default_rate"), m.get("total_loans_disbursed")), 6
        ),
        swfRatio=_round(_div(m.get("welfare_fund_total"), total_savings)),
        leadershipCompleteness=_round(_div(leadership_filled, LEADERSHIP_SIZE)),
        genderLeadershipRatio=_round(
            _div(m.get("women_leaders_count"), leadership_filled)
        ),
        youthInclusionRatio=_round(_div(m.get("active_youth"), members_active)),
        retentionRate=(
            _round(1 - dropped / formation)
            if (dropped is not None and formation)
            else None
        ),
        growthRate=(
            _round((members_active - formation) / formation)
            if (members_active is not None and formation)
            else None
        ),
        maturityScore=None,
        # carried for the dashboard's leadership tile + DQ transparency, not a ratio
        leadershipFilled=leadership_filled,
    )


def attach_maturity_scores(rows):
    """Fill maturityScore = mean of each group's AVAILABLE component z-scores.

    Missing components are omitted rather than zero-filled (zero-filling would
    read as "average" and quietly reward incomplete records); a group with no
    available component gets None.
    """
    zcols = [_zscore([r.get(c) for r in rows]) for c in MATURITY_COMPONENTS]
    for i, r in enumerate(rows):
        zs = [col[i] for col in zcols if col[i] is not None]
        r["maturityScore"] = _round(sum(zs) / len(zs)) if zs else None
    return rows


def build(metrics):
    """metrics rows from transform.run() -> {group_kobo_id: ratios dict}."""
    ordered = [(m["group_kobo_id"], compute_ratios(m)) for m in metrics]
    attach_maturity_scores([r for _, r in ordered])
    return {kid: r for kid, r in ordered}


if __name__ == "__main__":
    import transform

    data = transform.run()
    by_id = build(data["metrics"])
    names = {g["kobo_id"]: g["group_name"] for g in data["groups"]}
    print(f"ratios for {len(by_id)} groups\n")
    for key in RATIO_KEYS:
        vals = [r[key] for r in by_id.values() if r[key] is not None]
        if vals:
            print(f"  {key:26} n={len(vals):3}  min={min(vals):>10.4f}  max={max(vals):>10.4f}")
        else:
            print(f"  {key:26} n=  0  (all null)")
    print("\ntop 5 by maturityScore:")
    top = sorted(
        (r for r in by_id.items() if r[1]["maturityScore"] is not None),
        key=lambda kv: kv[1]["maturityScore"],
        reverse=True,
    )[:5]
    for kid, r in top:
        print(f"  {names.get(kid, kid)[:34]:36} {r['maturityScore']:+.4f}")
