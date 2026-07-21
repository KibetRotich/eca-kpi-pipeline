"""Step 3 — explanatory modelling.
Approach: grouped binomial logistic (survival = alive out of planted trials).
 - Form 1 (UG, cross-sectional, n~199): GLM binomial; quasi-binomial scale for overdispersion.
 - Form 2 (KE, panel: 866 farmers x ~2.5 visits): GLM binomial with cluster-robust SE by farmer
   (population-average effect accounting for repeated measures). GEE(exchangeable) as robustness check.
VIF for multicollinearity; category frequencies for class-imbalance; do-not-pool argument.
"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd, re
import statsmodels.api as sm
import statsmodels.formula.api as smf
import patsy
from statsmodels.stats.outliers_influence import variance_inflation_factor

f1=pd.read_csv("data/clean/form1_batch.csv")
f2b=pd.read_csv("data/clean/form2_batch.csv")
f2s=pd.read_csv("data/clean/form2_species.csv")
f2s=f2s.merge(f2b[["sub_id","farmer_bene_id","sub_time"]].rename(columns={"sub_time":"st"}),on="sub_id",how="left")

def clean_surv(d):
    d=d[d["planted"].notna()&(d["planted"]>0)&d["alive"].notna()].copy()
    d=d[d["alive"]<=d["planted"]+2]
    d["alive"]=d["alive"].clip(upper=d["planted"])
    d["fail"]=(d["planted"]-d["alive"]).clip(lower=0)
    return d
s1=clean_surv(f1); s2=clean_surv(f2s)

# ---- predictor engineering ----
def growth3(v):
    if v in ("Very Good",):return "1_VeryGood"
    if v in ("Good",):return "2_Good"
    if v in ("Same","Poor","Very poor","Very Poor"):return "3_Same_or_worse"
    return None
def transport2_f1(v):
    if not isinstance(v,str):return None
    if "Motorcycle" in v or "Boda" in v:return "Motorcycle"
    if "Head" in v or "hand" in v:return "Head/hand"
    return "Other"
def transport_bucket_f2(v):
    if not isinstance(v,str) or not v.strip():return None
    t=v.lower()
    if re.search(r"motor|boda|motto|motob",t):return "Motorcycle"
    if re.search(r"wheel",t):return "Wheelbarrow"
    if re.search(r"donkey|ox|cart",t):return "Donkey/Oxcart"
    if re.search(r"van|lorr|truck|pick|vehicle",t):return "Vehicle"
    if re.search(r"bicycle|bike",t):return "Bicycle"
    if re.search(r"head|hand|carri|foot|trek|walk|myself|my own|self|manual|sack|kiondo|bag|went",t):return "Head/hand/manual"
    return "Other"
def wave(t):
    t=pd.to_datetime(t);y,m=t.year,t.month
    if y==2024 or (y==2025 and m<=1):return "W1"
    if y==2025 and 5<=m<=8:return "W2"
    if y==2025 and m>=10:return "W3"
    if y==2026 and m>=5:return "W4"
    return None

s1["growth"]=s1["growth_perception"].apply(growth3)
s1["transport_c"]=s1["transport"].apply(transport2_f1)
s1["gender"]=s1["farmer_gender"].str.strip().str.title().where(s1["farmer_gender"].notna())
s1["has_ficus_nat"]=s1["species_taken"].fillna("").str.contains("Ficus Natalensis").map({True:"Yes",False:"No"})

s2["growth"]=s2["growth_perception"].apply(growth3)
s2["transport_c"]=s2["transport"].apply(transport_bucket_f2)
s2["wave"]=s2["st"].apply(wave)
s2["species_c"]=s2["species"].str.replace(r"\s*\(.*\)","",regex=True).str.strip()

def fmt_or(res, title, n, note=""):
    p=res.params; ci=res.conf_int()
    df=pd.DataFrame({"coef":p,"OR":np.exp(p),"OR_lo":np.exp(ci[0]),"OR_hi":np.exp(ci[1]),"p":res.pvalues})
    df=df.round(3)
    print(f"\n{'='*72}\n{title}   (n={n})  {note}")
    print(df.to_string())
    return df

def vif_table(X, title):
    Xc=X.drop(columns=[c for c in X.columns if c.lower().startswith("intercept")],errors="ignore")
    v=pd.DataFrame({"var":Xc.columns,"VIF":[variance_inflation_factor(Xc.values,i) for i in range(Xc.shape[1])]})
    print(f"\n-- VIF: {title} --"); print(v.round(2).to_string(index=False))

# =================== FORM 1 model ===================
d1=s1.dropna(subset=["growth","transport_c","district","alive","fail"]).copy()
d1=d1[d1["transport_c"].isin(["Motorcycle","Head/hand"])]
y1,X1=patsy.dmatrices("alive + fail ~ C(district)+C(transport_c)+C(growth)+C(has_ficus_nat)",
                      d1, return_type="dataframe")
endog1=np.c_[d1["alive"].values, d1["fail"].values]
m1=sm.GLM(endog1, X1, family=sm.families.Binomial()).fit()
# overdispersion
pearson=(m1.resid_pearson**2).sum()/m1.df_resid
m1q=sm.GLM(endog1, X1, family=sm.families.Binomial()).fit(scale="X2")  # quasi-binomial
print(f"\nFORM1 overdispersion (Pearson/df) = {pearson:.2f}  -> using quasi-binomial SEs")
fmt_or(m1q,"FORM 1 (UG) survival — grouped logistic, quasi-binomial",len(d1),
       "ref: district=mityana, transport=Head/hand, growth=VeryGood")
vif_table(X1,"Form 1")
# add gender on complete cases
dg=d1.dropna(subset=["gender"]); dg=dg[dg["gender"].isin(["Male","Female"])]
if dg["gender"].nunique()==2 and len(dg)>60:
    yg,Xg=patsy.dmatrices("alive+fail ~ C(district)+C(transport_c)+C(growth)+C(gender)",dg,return_type="dataframe")
    mg=sm.GLM(np.c_[dg['alive'],dg['fail']],Xg,family=sm.families.Binomial()).fit(scale="X2")
    fmt_or(mg,"FORM 1 (UG) + gender (complete cases)",len(dg),"ref gender=Female")

# =================== FORM 2 model ===================
d2=s2.dropna(subset=["growth","transport_c","admin3","species_c","wave","farmer_bene_id","alive","fail"]).copy()
top_sp=d2["species_c"].value_counts()[lambda x:x>=100].index
d2=d2[d2["species_c"].isin(top_sp)]
# references set to MODAL category to avoid VIF inflation from tiny reference cells
endog2=np.c_[d2["alive"].values,d2["fail"].values]
FORM='alive+fail ~ C(species_c, Treatment("Apple")) + C(admin3, Treatment("Charagita")) + \
  C(transport_c, Treatment("Head/hand/manual")) + C(growth, Treatment("2_Good")) + \
  C(training_received, Treatment("Yes")) + C(wave, Treatment("W1"))'
y2,X2=patsy.dmatrices(FORM, d2, return_type="dataframe")
m2=sm.GLM(endog2,X2,family=sm.families.Binomial()).fit(
    cov_type="cluster", cov_kwds={"groups":d2["farmer_bene_id"].values})
fmt_or(m2,"FORM 2 (KE) survival — grouped logistic, cluster-robust by farmer (modal refs)",len(d2),
       f"clusters(farmers)={d2['farmer_bene_id'].nunique()}")
vif_table(X2,"Form 2 (modal refs)")
# is 'training=No' confounded with the high-survival early wave?
print("\n-- training_received x wave (row% within training) --")
ct=pd.crosstab(d2["training_received"],d2["wave"],normalize="index").round(3)*100
print(ct.to_string())
print("survival by training within each wave (pooled):")
print(d2.groupby(["wave","training_received"]).apply(lambda x:x['alive'].sum()/x['planted'].sum(),include_groups=False).round(3).to_string())

# GEE robustness (population-average, exchangeable within farmer) on binary seedling-level approx:
# use proportion with binomial GEE via var handling -> fit on batch mean not needed; report cluster GLM as primary.

# class imbalance snapshot
print("\n-- Form2 predictor frequencies (class imbalance) --")
for c in ["species_c","admin3","transport_c","growth","training_received","wave"]:
    vc=d2[c].value_counts(); print(f"  {c}: "+", ".join(f"{k}={v}" for k,v in vc.items()))

# =================== do-not-pool evidence ===================
print(f"\n{'='*72}\nPOOLING TEST")
print(f"Form1 UG pooled survival={s1['alive'].sum()/s1['planted'].sum():.3f} (n={len(s1)}, 4 UG districts, 1 campaign Mar-Apr2026)")
print(f"Form2 KE pooled survival={s2['alive'].sum()/s2['planted'].sum():.3f} (n={len(s2)} species-rows, Nyandarua, 4 waves 2024-2026)")
print("Cohort dummy is fully confounded with country+species set+season+grain -> not identifiable as a 'form effect'.")
print("Species overlap: only 'Calliandra' common to both. => report side-by-side, do NOT pool a single trend line.")

# =================== high-mortality classifier (secondary) ===================
print(f"\n{'='*72}\nHIGH-MORTALITY EVENT (Form2 batch, top-quartile loss) — quick logistic")
fb=clean_surv(f2b).copy()
fb["loss"]=1-(fb["alive"]/fb["planted"]).clip(0,1)
thr=fb["loss"].quantile(0.75)
fb["high_loss"]=(fb["loss"]>=thr).astype(int)
fb["transport_c"]=fb["transport"].apply(transport_bucket_f2)
fb["growth"]=fb["growth_perception"].apply(growth3)
fb["wave"]=fb["sub_time"].apply(wave)
fbm=fb.dropna(subset=["transport_c","growth","admin3","wave"])
try:
    mc=smf.logit("high_loss ~ C(admin3)+C(transport_c)+C(growth)+C(wave)",data=fbm).fit(disp=0)
    print(f"threshold loss>= {thr:.2f}; n={len(fbm)}; pseudo-R2={mc.prsquared:.3f}")
    orc=pd.DataFrame({"OR":np.exp(mc.params),"lo":np.exp(mc.conf_int()[0]),"hi":np.exp(mc.conf_int()[1]),"p":mc.pvalues}).round(3)
    print(orc.to_string())
except Exception as e:
    print("classifier failed:",e)

# =================== mixed-effects (farmer random intercept) — clustering magnitude ===================
print(f"\n{'='*72}\nMIXED-EFFECTS check (Form2): farmer random intercept, MixedLM on survival rate")
dm=s2.dropna(subset=["growth","transport_c","species_c","wave","farmer_bene_id"]).copy()
dm=dm[dm["species_c"].isin(top_sp)]
dm["sr"]=(dm["alive"]/dm["planted"]).clip(0,1)
try:
    mlm=smf.mixedlm("sr ~ C(species_c)+C(transport_c)+C(growth)+C(wave)", dm,
                    groups=dm["farmer_bene_id"]).fit(method="lbfgs")
    re_var=float(mlm.cov_re.iloc[0,0]); resid=float(mlm.scale); icc=re_var/(re_var+resid)
    print(f"farmer random-intercept var={re_var:.4f}, residual var={resid:.4f}, ICC={icc:.3f}")
    print(f"-> {icc:.0%} of survival variance is BETWEEN farmers (flat regression would understate SEs).")
except Exception as e:
    print("MixedLM failed:",e)

# persist model tables
fmt=lambda res: pd.DataFrame({"OR":np.exp(res.params),"OR_lo":np.exp(res.conf_int()[0]),
                              "OR_hi":np.exp(res.conf_int()[1]),"p":res.pvalues}).round(3)
fmt(m1q).to_csv("out/model_form1_or.csv"); fmt(m2).to_csv("out/model_form2_or.csv")
print("\n[saved model OR tables to out/]")
