"""Profile the Kobo CFP export locally: header shape, coverage, distributions.

Deliberately prints only compact summaries -- raw rows must never leave this script.
Usage: python tools/profile_export.py [--section NAME]
"""
import csv
import sys
from collections import Counter, defaultdict

CSV_PATH = "data/raw/cfp_submissions.csv"


def load():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as fh:
        sniff = fh.read(8192)
        fh.seek(0)
        delim = ";" if sniff.count(";") > sniff.count(",") else ","
        return list(csv.DictReader(fh, delimiter=delim)), delim


def nonblank(rows, col):
    return sum(1 for r in rows if (r.get(col) or "").strip() not in ("", "n/a"))


def dist(rows, col, top=25):
    c = Counter((r.get(col) or "").strip() for r in rows)
    c.pop("", None)
    return c.most_common(top)


def numstats(rows, col):
    vals = []
    for r in rows:
        v = (r.get(col) or "").strip()
        if v:
            try:
                vals.append(float(v))
            except ValueError:
                pass
    if not vals:
        return None
    vals.sort()
    n = len(vals)
    q = lambda p: vals[min(n - 1, int(p * n))]
    return dict(n=n, min=vals[0], p25=q(.25), med=q(.5), p75=q(.75), p95=q(.95), max=vals[-1],
                mean=round(sum(vals) / n, 2))


def main():
    rows, delim = load()
    cols = list(rows[0].keys())
    print(f"delimiter={delim!r}  rows={len(rows)}  columns={len(cols)}\n")

    # --- repeat-group column shape -------------------------------------
    reps = defaultdict(set)
    for c in cols:
        if "[" in c and "]" in c:
            base = c.split("[")[0]
            idx = c.split("[")[1].split("]")[0]
            reps[base].add(int(idx))
    print("=== REPEAT GROUPS (max instances materialised as columns) ===")
    for base in sorted(reps):
        print(f"  {base}: max_idx={max(reps[base])}")
    if not reps:
        print("  (none -- repeats not bracket-expanded; checking slash form)")
        slash = defaultdict(int)
        for c in cols:
            if "/" in c:
                slash[c.split("/")[0]] += 1
        for k, v in sorted(slash.items(), key=lambda x: -x[1])[:20]:
            print(f"  {k}: {v} cols")
    print()

    # --- identity / meta ------------------------------------------------
    print("=== META ===")
    for c in ("_id", "_uuid", "_submission_time", "_submitted_by", "__version__",
              "_index", "_parent_index", "_parent_table_name"):
        hits = [x for x in cols if x == c or x.endswith(c)]
        if hits:
            col = hits[0]
            print(f"  {col}: nonblank={nonblank(rows, col)} distinct={len({(r.get(col) or '') for r in rows})}")
    for c in cols:
        if c.endswith("__version__") or c == "__version__":
            print(f"  version dist: {dist(rows, c, 10)}")
    st = [(r.get("_submission_time") or "").strip()[:10] for r in rows]
    st = sorted(x for x in st if x)
    if st:
        print(f"  submission_time range: {st[0]} .. {st[-1]}")
        print(f"  by month: {Counter(x[:7] for x in st).most_common()}")
    print()

    # --- key categoricals ----------------------------------------------
    print("=== KEY CATEGORICALS ===")
    keys = [
        "general_information__admin_level_0", "general_information__project",
        "general_information__admin_level_1", "general_information__admin_level_1_title",
        "general_information__admin_level_2_title", "general_information__admin_level_3_title",
        "general_information__gender", "general_information__literacy_level",
        "general_information__disability", "general_information__disability_form",
        "general_information__access_to_mobile_device", "general_information__mobile_device_type",
        "general_information__access_to_internet_3_mnths", "general_information__language",
        "general_information__cooperative_membership",
        "crop_details__crop_type", "crop_details__soil_type", "crop_details__gwp",
        "crop_details__growing_area_uom", "crop_details__no_plants_per_area_uom",
        "crop_details__dead_plants_replaced", "crop_details__assessment_year",
        "crop_residues_pruning__pruning_option", "crop_residues_pruning__pruning_weight_uom",
        "waste_water__waste_water_treatment_exist",
        "pesticide__pesticide_applied_exist",
        "fertilizer_into__fertilizer_applied_exist",
        "fuel_energy_into__fuel_energy_applied_exist",
        "irrigation_energy_into__irrigation_energy_applied_exist",
        "non_crps_est__intercrop_exist", "non_crps_est__shade_trees_exist",
        "non_crps_est__hedges_exist",
        "re_deforestation__forest_change", "re_deforestation__forest_type",
        "soil_carbon_into__land_use_change_exist",
    ]
    for k in keys:
        if k in cols:
            print(f"  {k}  (nonblank={nonblank(rows, k)})")
            for v, n in dist(rows, k, 12):
                print(f"      {n:>5}  {v[:70]}")
        else:
            near = [c for c in cols if c.endswith(k.split('__')[-1])]
            print(f"  !! MISSING {k}   near={near[:3]}")
    print()

    # --- numerics -------------------------------------------------------
    print("=== NUMERIC RANGES ===")
    for k in ("general_information__birth_year", "general_information__household_size",
              "crop_details__expected_lifecycle_years", "crop_details__crop_age",
              "crop_details__growing_area", "crop_details__dead_plants_perc",
              "crop_details__no_plants_per_area",
              "crop_yield__total_yield_assessment_year",
              "crop_residues__waste_fuit_perc",
              "crop_residues_pruning__pruning_constant_pruning_val",
              "crop_residues_pruning__pruning_constant_pruning_start_year",
              "re_deforestation__de_area_re_deforested",
              "re_deforestation__de_forest_removed_age"):
        if k in cols:
            print(f"  {k}: {numstats(rows, k)}")
    print()

    # --- wide year columns ---------------------------------------------
    print("=== WIDE YEAR COLUMNS: coverage ===")
    for pre in ("crop_yield__yield_est_year_", "crop_residues_pruning__pruning_est_year_"):
        cov = [(i, nonblank(rows, f"{pre}{i}")) for i in range(31) if f"{pre}{i}" in cols]
        if cov:
            print(f"  {pre}: y0={cov[0][1]} y10={dict(cov).get(10)} y20={dict(cov).get(20)} y30={dict(cov).get(30)}")
            s = numstats(rows, f"{pre}5")
            print(f"      sample year_5 stats: {s}")
    print()

    # --- residue fate coverage -----------------------------------------
    print("=== RESIDUE STREAMS: coverage + mean share ===")
    streams = ("pruning", "leaf_litter", "fruit", "dead_plant", "end_of_life_cycle",
               "life_cycle_end_woody_roots", "life_cycle_end_leaves", "pulp_hask", "seed")
    fates = ("burn", "heaps_pits", "aerobic_compost", "anaerobic_compost", "left_on_soil", "export")
    for s in streams:
        parts = []
        for f in fates:
            c = f"crop_residues__{s}_{f}"
            if c in cols:
                st_ = numstats(rows, c)
                parts.append(f"{f}={st_['mean'] if st_ else '-'}(n={st_['n'] if st_ else 0})")
        print(f"  {s}: {' '.join(parts)}")
    print()

    # --- GPS ------------------------------------------------------------
    gpsc = [c for c in cols if c.endswith("registration_gps")]
    if gpsc:
        c = gpsc[0]
        ok = bad = 0
        for r in rows:
            p = (r.get(c) or "").split()
            if len(p) >= 2:
                try:
                    la, lo = float(p[0]), float(p[1])
                    if -5 < la < 6 and 28 < lo < 42:
                        ok += 1
                    else:
                        bad += 1
                except ValueError:
                    bad += 1
        print(f"=== GPS === {c}: in_EA_bbox={ok} out_of_bbox_or_bad={bad} blank={len(rows)-ok-bad}")
    print()

    # --- completeness ranking ------------------------------------------
    print("=== 30 EMPTIEST / 15 FULLEST DATA COLUMNS ===")
    skip = ("[" in "".join(cols))
    cov = sorted(((nonblank(rows, c), c) for c in cols if not c.startswith("_")), key=lambda x: x[0])
    for n, c in cov[:30]:
        print(f"  {n:>5}  {c[:90]}")
    print("  ---")
    for n, c in cov[-15:]:
        print(f"  {n:>5}  {c[:90]}")


if __name__ == "__main__":
    main()
