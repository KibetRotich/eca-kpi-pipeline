"""Parse a Solidaridad IPTT tab (Indicator Performance Tracking Table) — e.g. the
P2P Coffee county tabs — into per-year rows.

Layout: indicator name in column D; a header row with "Overall Achievement YYYY"
marking each year's block of six columns: Male Adults, Female Adults, Male Youths,
Female Youths, Non-individual, Total. Indicators are matched to the framework's
indicator_id by name (whitespace/case-insensitive), so row order may differ.

Rules (same as the dashboard_input build for the project-level tab):
  male = male adults + male youths; female = female adults + female youths;
  youth = male youths + female youths; a total of 0 with an empty breakdown is a
  formula placeholder, not a report; a "%" in a count column is ignored.
"""
import re


def _num(v):
    s = str(v).strip().replace(",", "")
    if not s or s.startswith("#") or s.endswith("%"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def norm(t):
    return re.sub(r"[^a-z0-9]+", " ", str(t).lower()).strip()


def parse_iptt(values, id_by_name):
    """values: list of rows (strings). id_by_name: {norm(indicator name): indicator_id}.
    Returns (rows, unmatched_names)."""
    blocks = {}
    for row in values[:8]:
        for c, v in enumerate(row):
            m = re.match(r"\s*Overall Achievement\s+(\d{4})", str(v))
            if m:
                blocks[int(m.group(1))] = c
    out, unmatched = [], []
    for row in values:
        row = list(row) + [""] * (60 - len(row))
        name = row[3].strip()
        if not name or norm(name) in ("indicators",):
            continue
        iid = id_by_name.get(norm(name))
        if not iid:
            if any(_num(row[c + k]) is not None for c in blocks.values() for k in range(6)):
                unmatched.append(name)
            continue
        for year, c in sorted(blocks.items()):
            ma, fa, my, fy, ni, tot = (_num(row[c + k]) for k in range(6))
            brk = [ma, fa, my, fy, ni]
            if tot is None and all(x is None for x in brk):
                continue
            if (tot or 0) == 0 and all(x is None for x in brk):
                continue                       # formula placeholder
            if tot is None:
                tot = sum(x or 0 for x in brk)
            sm = lambda *xs: None if all(x is None for x in xs) else sum(x or 0 for x in xs)
            out.append({"indicator_id": iid, "period_end": f"{year}-12", "total": tot,
                        "male": sm(ma, my), "female": sm(fa, fy), "youth": sm(my, fy), "non_individual": ni})
    return out, unmatched
