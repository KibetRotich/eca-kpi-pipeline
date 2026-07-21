"""Step 2 — descriptive analytics for both cohorts."""
import numpy as np, pandas as pd, re, json
pd.set_option("display.width",220,"display.max_colwidth",40,"display.max_rows",120)

f1=pd.read_csv("data/clean/form1_batch.csv")
f2b=pd.read_csv("data/clean/form2_batch.csv")
f2s=pd.read_csv("data/clean/form2_species.csv")
for d in (f1,f2b,f2s):
    if "sub_time" in d: d["sub_time"]=pd.to_datetime(d["sub_time"],errors="coerce")

# ---- Form2 monitoring wave ----
def wave(t):
    if pd.isna(t): return None
    y,m=t.year,t.month
    if (y==2024) or (y==2025 and m<=1): return "W1 2024Q4"
    if y==2025 and 5<=m<=8: return "W2 2025mid"
    if y==2025 and m>=10: return "W3 2025end"
    if y==2026 and m>=5: return "W4 2026mid"
    return f"other {y}-{m:02d}"
f2b["wave"]=f2b["sub_time"].apply(wave)
f2s=f2s.merge(f2b[["sub_id","wave","admin2","cooperative"]].rename(columns={"admin2":"admin2_b"}),on="sub_id",how="left",suffixes=("","_b"))

# ---- analysis-ready survival (planted>0, drop impossible alive>planted+2) ----
def prep_surv(d):
    d=d.copy()
    d=d[d["planted"].notna() & (d["planted"]>0)]
    d=d[d["alive"].notna()]
    d=d[d["alive"]<=d["planted"]+2]           # drop impossible
    d["sr"]=(d["alive"]/d["planted"]).clip(0,1)
    return d
s1=prep_surv(f1); s2=prep_surv(f2s)

def pooled(d): return d["alive"].sum()/d["planted"].sum()
def brk(d,col,minn=15):
    g=d.groupby(col)
    out=pd.DataFrame({"n":g.size(),"pooled_sr":g.apply(lambda x:x["alive"].sum()/x["planted"].sum(),include_groups=False),
                      "median_sr":g["sr"].median(),"mean_sr":g["sr"].mean()})
    return out[out["n"]>=minn].sort_values("pooled_sr").round(3)

print("="*70,"\nOVERALL SURVIVAL (alive/planted)")
print(f"Form1 UG: n={len(s1)} pooled={pooled(s1):.3f} median={s1['sr'].median():.3f}  | alive/collected pooled={s1['alive'].sum()/s1['collected'].sum():.3f}")
print(f"Form2 KE (species rows): n={len(s2)} pooled={pooled(s2):.3f} median={s2['sr'].median():.3f}")
f2b_s=prep_surv(f2b.rename(columns={}))
print(f"Form2 KE (batch): n={len(f2b_s)} pooled={pooled(f2b_s):.3f} median={f2b_s['sr'].median():.3f}")

print("\n--- FORM1 survival by DISTRICT ---");   print(brk(s1,"district").to_string())
print("\n--- FORM1 survival by SPECIES (taken, multi -> uses batch label) ---"); print(brk(s1,"species_taken",10).to_string())
print("\n--- FORM1 survival by TRANSPORT ---");  print(brk(s1,"transport").to_string())
print("\n--- FORM1 survival by TRAINING ---");   print(brk(s1,"training_received").to_string())
print("\n--- FORM1 survival by GROWTH PERCEPTION ---"); print(brk(s1,"growth_perception").to_string())

print("\n--- FORM2 survival by ADMIN2 ---");     print(brk(s2,"admin2").to_string())
print("\n--- FORM2 survival by ADMIN3 ---");     print(brk(s2,"admin3").to_string())
print("\n--- FORM2 survival by SPECIES ---");    print(brk(s2,"species",50).to_string())
print("\n--- FORM2 survival by TRANSPORT ---");  print(brk(s2,"transport").to_string())
print("\n--- FORM2 survival by TRAINING ---");   print(brk(s2,"training_received").to_string())
print("\n--- FORM2 survival by GROWTH PERCEPTION ---"); print(brk(s2,"growth_perception").to_string())
print("\n--- FORM2 survival by WAVE ---");       print(brk(s2,"wave").to_string())

# ---- loss reason bucketing (free text) ----
BUCK=[("Drought/water stress",r"drought|dry|water|sun|rain\b|lack of rain|scorch"),
      ("Pests & diseases",r"pest|disease|termite|insect|aphid|fungal|rot"),
      ("Livestock/animals",r"animal|graz|goat|cattle|cow|livestock|brows|eaten|monkey|wild"),
      ("Poor management/neglect",r"neglect|not water|manage|weed|care|abandon|late"),
      ("Weather/floods",r"flood|storm|wind|hail|cold|frost|water logg|waterlog"),
      ("Theft/damage",r"theft|stol|steal|vandal|damage|physical|burn|fire|slash"),
      ("Soil/poor site",r"soil|infertile|rocky|acidic|poor land"),
      ("Transplant shock/quality",r"transplant|shock|weak seedling|small seedling|poor quality|nursery")]
def bucket(txt):
    if not isinstance(txt,str) or not txt.strip(): return None
    t=txt.lower()
    for lab,pat in BUCK:
        if re.search(pat,t): return lab
    return "Other/unspecified"
for name,d,col in [("FORM1 death reasons",f1,"reason_death"),("FORM1 not-planted reasons",f1,"reason_not_plant"),
                   ("FORM2 death reasons (species)",f2s,"reason_death")]:
    b=d[col].apply(bucket).value_counts()
    print(f"\n--- {name} (n text={d[col].apply(lambda x:isinstance(x,str) and bool(x.strip())).sum()}) ---")
    print((100*b/b.sum()).round(1).to_string())

# ---- growth perception vs actual survival ----
print("\n"+"="*70,"\nGROWTH PERCEPTION vs ACTUAL SURVIVAL")
for nm,d in [("Form1",s1),("Form2",s2)]:
    order=["Very Good","Good","Same","Poor","Very poor"]
    g=d[d["growth_perception"].isin(order)].groupby("growth_perception")["sr"].agg(["size","median","mean"]).reindex(order).dropna()
    print(f"\n{nm}:"); print(g.round(3).to_string())

# ---- Form2 crop + env/social/economic block ----
print("\n"+"="*70,"\nFORM2 CROP + ENV/SOCIAL/ECONOMIC (% positive/Yes)")
def pct_yes(col):
    s=f2b[col].dropna().astype(str)
    s=s[s!=""]
    if len(s)==0: return None
    return round(100*s.str.strip().str.lower().str.startswith(("yes","present","increase","improv")).mean(),1)
for c in ["crop_failure","forest_cover_increase","soil_quality_improvement","env_benefits",
          "biodiversity_evidence","deforestation_reduction","economic_benefits_products"]:
    if c in f2b: print(f"  {c:32s}: %Yes={pct_yes(c)}  (n={f2b[c].replace('',np.nan).notna().sum()})")
# crop integration rate
ci=f2b["crops_grown"].replace("",np.nan).notna().mean()
print(f"  crop integration (any crop grown)  : {100*ci:.1f}%")

# ---- Coffee mini-analysis (Form1) ----
print("\n"+"="*70,"\nFORM1 COFFEE SUB-SECTION")
cf=f1[f1["coffee_received"].notna() & (f1["coffee_received"]>0)]
print(f"n with coffee received>0: {len(cf)}")
if len(cf):
    print(f"  total received={cf['coffee_received'].sum():.0f} planted={cf['coffee_planted'].sum():.0f} alive={cf['coffee_alive'].sum():.0f}")
    print(f"  coffee survival alive/planted pooled={cf['coffee_alive'].sum()/cf['coffee_planted'].sum():.3f}")
    print(f"  planting rate planted/received pooled={cf['coffee_planted'].sum()/cf['coffee_received'].sum():.3f}")

# save key breakdown tables
brk(s2,"species",50).to_csv("out/form2_survival_by_species.csv")
brk(s1,"district").to_csv("out/form1_survival_by_district.csv")
brk(s2,"admin3").to_csv("out/form2_survival_by_admin3.csv")
print("\n[saved breakdown CSVs to out/]")
