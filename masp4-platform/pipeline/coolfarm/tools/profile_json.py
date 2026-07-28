"""Profile the CFP dataset from local JSON: structure, coverage, distributions, DQ.

Prints compact summaries only -- raw rows never leave this script.
Usage: python tools/profile_json.py <section>
  sections: struct | groups | cats | nums | years | residues | repeats | dq | choices | all
"""
import json
import sys
from collections import Counter, defaultdict

SUB = "data/raw/submissions.json"
FORM = "data/raw/form_content.json"


def load():
    with open(SUB, encoding="utf-8") as fh:
        rows = json.load(fh)
    with open(FORM, encoding="utf-8") as fh:
        form = json.load(fh)
    # The raw API emits top-level keys as "group/field"; normalise to the
    # "group__field" form used throughout this script (and by the Kobo MCP tool).
    # Repeat-group values are lists of dicts and are left untouched.
    norm = []
    for r in rows:
        norm.append({(k.replace("/", "__") if not isinstance(v, list) else k): v
                     for k, v in r.items()})
    return norm, form


def nb(rows, col):
    return sum(1 for r in rows if str(r.get(col, "")).strip() not in ("", "None"))


def dist(rows, col, top=30):
    c = Counter(str(r.get(col, "")).strip() for r in rows)
    c.pop("", None)
    return c.most_common(top)


def nstats(rows, col, cast=float):
    vals = []
    for r in rows:
        v = str(r.get(col, "")).strip()
        if v and v != "None":
            try:
                vals.append(cast(v))
            except ValueError:
                pass
    if not vals:
        return None
    vals.sort()
    n = len(vals)
    q = lambda p: vals[min(n - 1, int(p * n))]
    return dict(n=n, min=vals[0], p05=q(.05), med=q(.5), p95=q(.95), max=vals[-1],
                mean=round(sum(vals) / n, 2))


def survey_groups(form):
    """Reconstruct group/repeat nesting from the survey sheet."""
    stack, out = [], []
    for r in form.get("survey", []):
        t, nm = r.get("type"), r.get("name") or r.get("$autoname")
        if t in ("begin_group", "begin_repeat"):
            stack.append((nm, t))
            out.append(("OPEN" if t == "begin_group" else "OPEN_REPEAT", "/".join(s[0] for s in stack)))
        elif t in ("end_group", "end_repeat"):
            if stack:
                stack.pop()
        else:
            out.append((t, "/".join([s[0] for s in stack] + [str(nm)])))
    return out


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    rows, form = load()
    allkeys = Counter()
    for r in rows:
        allkeys.update(r.keys())
    print(f"rows={len(rows)}  distinct_top_level_keys={len(allkeys)}\n")

    if what in ("struct", "all"):
        print("=== TOP-LEVEL KEYS: coverage (data fields only) ===")
        for k, n in sorted(allkeys.items(), key=lambda x: (-x[1], x[0])):
            if k.startswith("_") or k.startswith("meta") or k.startswith("formhub"):
                continue
            filled = nb(rows, k) if not isinstance(rows[0].get(k), list) else sum(
                1 for r in rows if isinstance(r.get(k), list) and r.get(k))
            print(f"  present={n:>5} filled={filled:>5}  {k}")
        print()

    if what in ("groups", "all"):
        print("=== SURVEY STRUCTURE (groups / repeats) ===")
        for t, path in survey_groups(form):
            if t in ("OPEN", "OPEN_REPEAT"):
                print(f"  [{t}] {path}")
        print()
        print("=== REPEAT GROUPS in data: instance counts ===")
        # A real repeat group is a list of dicts; `_geolocation` is a list of floats
        # and `_attachments` is usually empty -- exclude both.
        repeats = [k for k in allkeys if not k.startswith("_") and any(
            isinstance(r.get(k), list) and r[k] and isinstance(r[k][0], dict) for r in rows)]
        for k in sorted(repeats):
            counts = [len(r[k]) for r in rows if isinstance(r.get(k), list)]
            if counts:
                inner = set()
                for r in rows:
                    for it in (r.get(k) or []):
                        inner.update(it.keys())
                print(f"  {k}: submissions_with={len(counts)} total_instances={sum(counts)} "
                      f"max={max(counts)} mean={round(sum(counts)/len(counts),2)}")
                for f in sorted(inner):
                    print(f"       - {f}")
        print()

    if what in ("cats", "all"):
        print("=== CATEGORICALS ===")
        keys = [k for k in allkeys if not k.startswith(("_", "meta", "formhub", "__"))]
        skip_txt = ("farmer_first_name", "farmer_other_names", "phone_number", "village",
                    "cooperative_name", "admin_level_3", "enumerator_name",
                    "enumerators_comment", "farmer_questions", "registration_gps")
        for k in sorted(keys):
            if any(s in k for s in skip_txt):
                continue
            if any(isinstance(r.get(k), list) for r in rows):
                continue
            d = dist(rows, k, 40)
            if not d or len(d) > 40:
                continue
            uniq = len(set(str(r.get(k, "")).strip() for r in rows) - {""})
            if uniq <= 40:
                print(f"  {k}  (filled={nb(rows,k)} distinct={uniq})")
                for v, n in d:
                    print(f"      {n:>5}  {v[:78]}")
        print()

    if what in ("nums", "all"):
        print("=== NUMERIC RANGES ===")
        for k in ("general_information__birth_year", "general_information__household_size",
                  "crop_details__expected_lifecycle_years", "crop_details__crop_age",
                  "crop_details__growing_area", "crop_details__dead_plants_perc",
                  "crop_details__no_plants_per_area", "crop_details__assessment_year",
                  "crop_yield__total_yield_assessment_year",
                  "crop_residues__waste_fuit_perc",
                  "crop_residues_pruning__pruning_constant_pruning_val",
                  "crop_residues_pruning__pruning_constant_pruning_start_year",
                  "re_deforestation__de_area_re_deforested",
                  "re_deforestation__de_forest_removed_age",
                  "re_deforestation__de_final_year_pruning_perc"):
            if k in allkeys:
                print(f"  {k.split('__')[-1]:<42} {nstats(rows,k)}")
        print()

    if what in ("years", "all"):
        print("=== WIDE YEAR COLUMNS ===")
        for pre, lbl in (("crop_yield__yield_est_year_", "yield %"),
                         ("crop_residues_pruning__pruning_est_year_", "pruning est")):
            cov = []
            for i in range(31):
                c = f"{pre}{i}"
                if c in allkeys:
                    cov.append((i, nb(rows, c)))
            if cov:
                print(f"  {lbl} ({pre}N): years present={len(cov)}")
                print(f"      coverage: " + " ".join(f"y{i}={n}" for i, n in cov[:6]) +
                      " ... " + " ".join(f"y{i}={n}" for i, n in cov[-3:]))
                for i in (0, 5, 15, 30):
                    s = nstats(rows, f"{pre}{i}")
                    if s:
                        print(f"      y{i}: {s}")
        print("  --- year label calc -> calendar year mapping ---")
        for i in (0, 1, 30):
            c = f"crop_details__year_{i}_label"
            if c in allkeys:
                print(f"      year_{i}_label distinct={len(set(str(r.get(c,'')) for r in rows))} "
                      f"sample={dist(rows,c,4)}")
        print()

    if what in ("residues", "all"):
        print("=== RESIDUE STREAMS x FATES (mean %, n filled, rows summing to 100) ===")
        streams = ("pruning", "leaf_litter", "fruit", "dead_plant", "end_of_life_cycle",
                   "life_cycle_end_woody_roots", "life_cycle_end_leaves", "pulp_hask", "seed")
        fates = ("burn", "heaps_pits", "aerobic_compost", "anaerobic_compost",
                 "left_on_soil", "export")
        for s in streams:
            cols = [(f, f"crop_residues__{s}_{f}") for f in fates
                    if f"crop_residues__{s}_{f}" in allkeys]
            if not cols:
                continue
            parts = []
            for f, c in cols:
                st = nstats(rows, c)
                parts.append(f"{f}={st['mean'] if st else '-'}")
            sums = Counter()
            for r in rows:
                tot = 0
                any_ = False
                for _, c in cols:
                    v = str(r.get(c, "")).strip()
                    if v and v != "None":
                        any_ = True
                        try:
                            tot += float(v)
                        except ValueError:
                            pass
                if any_:
                    sums["=100" if abs(tot - 100) < .01 else ("0" if tot == 0 else "other")] += 1
            print(f"  {s:<28} n={nb(rows, cols[0][1]):>5} fates={len(cols)} sums:{dict(sums)}")
            print(f"      mean%: {' '.join(parts)}")
        print()

    if what in ("repeats", "all"):
        print("=== REPEAT FIELD DISTRIBUTIONS ===")
        # A real repeat group is a list of dicts; `_geolocation` is a list of floats
        # and `_attachments` is usually empty -- exclude both.
        repeats = [k for k in allkeys if not k.startswith("_") and any(
            isinstance(r.get(k), list) and r[k] and isinstance(r[k][0], dict) for r in rows)]
        for rk in sorted(repeats):
            items = [it for r in rows for it in (r.get(rk) or [])]
            if not items:
                continue
            print(f"  --- {rk} ({len(items)} instances) ---")
            fields = sorted({f for it in items for f in it.keys()})
            for f in fields:
                vals = [str(it.get(f, "")).strip() for it in items]
                vals = [v for v in vals if v and v != "None"]
                uniq = sorted(set(vals))
                short = f.split("/")[-1]
                if len(uniq) <= 32:
                    c = Counter(vals).most_common(32)
                    print(f"      {short} (n={len(vals)} distinct={len(uniq)}):")
                    for v, n in c:
                        print(f"          {n:>5}  {v[:66]}")
                else:
                    nums = []
                    for v in vals:
                        try:
                            nums.append(float(v))
                        except ValueError:
                            pass
                    if len(nums) > len(vals) * .8:
                        nums.sort()
                        n = len(nums)
                        print(f"      {short} (n={n} NUMERIC): min={nums[0]} med={nums[n//2]} "
                              f"p95={nums[min(n-1,int(.95*n))]} max={nums[-1]}")
                    else:
                        print(f"      {short} (n={len(vals)} distinct={len(uniq)}) TOP: "
                              f"{Counter(vals).most_common(12)}")
        print()

    if what in ("dq", "all"):
        print("=== DATA QUALITY FLAGS ===")
        n = len(rows)
        gps = "general_information__registration_gps"
        okg = badg = 0
        for r in rows:
            p = str(r.get(gps, "")).split()
            if len(p) >= 2:
                try:
                    la, lo = float(p[0]), float(p[1])
                    (okg := okg) if False else None
                    if -5 < la < 6 and 28 < lo < 42:
                        okg += 1
                    else:
                        badg += 1
                except ValueError:
                    badg += 1
        print(f"  GPS: in_EA_bbox={okg} out/bad={badg} missing={n-okg-badg}")

        # duplicate farmers
        namek = ("general_information__farmer_first_name", "general_information__farmer_other_names")
        keys = [tuple(str(r.get(k, "")).strip().lower() for k in namek) for r in rows]
        dupn = sum(v for v in Counter(keys).values() if v > 1)
        print(f"  duplicate first+other name pairs: rows_involved={dupn} "
              f"distinct_dup_names={sum(1 for v in Counter(keys).values() if v>1)}")
        ph = [str(r.get("general_information__phone_number", "")).strip() for r in rows]
        ph = [p for p in ph if p]
        print(f"  phone: filled={len(ph)} distinct={len(set(ph))} "
              f"dup_rows={len(ph)-len(set(ph))}")

        # identical yield curves (copy-paste detection)
        curves = Counter()
        for r in rows:
            c = tuple(str(r.get(f"crop_yield__yield_est_year_{i}", "")) for i in range(31))
            if any(x for x in c):
                curves[c] += 1
        top = curves.most_common(5)
        print(f"  yield curves: distinct={len(curves)} rows_with={sum(curves.values())}")
        print(f"      most repeated curve counts: {[v for _,v in top]}")

        # lifecycle vs 31-column ceiling
        over = sum(1 for r in rows
                   if str(r.get("crop_details__expected_lifecycle_years", "")).strip().isdigit()
                   and int(r["crop_details__expected_lifecycle_years"]) > 30)
        print(f"  expected_lifecycle_years > 30 (curve truncated at year_30): {over}")

        # crop age vs yield curve start
        odd = 0
        for r in rows:
            a = str(r.get("crop_details__crop_age", "")).strip()
            y0 = str(r.get("crop_yield__yield_est_year_0", "")).strip()
            if a.isdigit() and int(a) > 3 and y0 == "0":
                odd += 1
        print(f"  mature crop (age>3) but year_0 yield=0: {odd}")

        # birth year sanity
        by = nstats(rows, "general_information__birth_year")
        print(f"  birth_year: {by}")
        bad_by = sum(1 for r in rows
                     if str(r.get("general_information__birth_year", "")).strip().isdigit()
                     and not (1920 <= int(r["general_information__birth_year"]) <= 2010))
        print(f"      implausible (<1920 or >2010): {bad_by}")

        # area unit mix
        print(f"  growing_area_uom: {dist(rows,'crop_details__growing_area_uom',6)}")
        print(f"  plants_per_area_uom: {dist(rows,'crop_details__no_plants_per_area_uom',6)}")

        # enumerator whitespace variants
        en = [str(r.get("conclusion__enumerator_name", "")).strip()
              for r in rows if str(r.get("conclusion__enumerator_name", "")).strip()]
        en_norm = [e.lower().strip() for e in en]
        print(f"  enumerators: raw_distinct={len(set(en))} normalised_distinct={len(set(en_norm))}")

        # version drift
        print(f"  form versions: {dist(rows,'__version__',10)}")
        print()

    if what in ("choices",):
        print("=== CHOICE LISTS (name -> #options) ===")
        cl = defaultdict(list)
        for c in form.get("choices", []):
            cl[c.get("list_name")].append(c.get("name"))
        for k in sorted(cl):
            print(f"  {k} ({len(cl[k])}): {', '.join(str(x)[:28] for x in cl[k][:14])}"
                  f"{' ...' if len(cl[k])>14 else ''}")


if __name__ == "__main__":
    main()
