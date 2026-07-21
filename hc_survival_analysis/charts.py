"""Key descriptive charts for the memo."""
import numpy as np, pandas as pd, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({"font.size":10,"axes.spines.top":False,"axes.spines.right":False,"figure.dpi":120})
NAVY="#1f4e5f"; TEAL="#2a9d8f"; AMBER="#e9c46a"; RUST="#e76f51"; GREY="#8d99ae"

f1=pd.read_csv("data/clean/form1_batch.csv")
f2s=pd.read_csv("data/clean/form2_species.csv")

def prep(d):
    d=d[d["planted"].notna()&(d["planted"]>0)&d["alive"].notna()]
    d=d[d["alive"]<=d["planted"]+2].copy(); d["sr"]=(d["alive"]/d["planted"]).clip(0,1); return d
s1=prep(f1); s2=prep(f2s)
def pooled(g): return g["alive"].sum()/g["planted"].sum()

# 1 Form1 survival by district
fig,ax=plt.subplots(figsize=(6,3.2))
g=s1.groupby("district").apply(lambda x:pd.Series({"sr":pooled(x),"n":len(x)}),include_groups=False).sort_values("sr")
ax.barh(g.index.str.title(),g["sr"],color=TEAL)
for i,(sr,n) in enumerate(zip(g["sr"],g["n"])): ax.text(sr+.01,i,f"{sr:.0%} (n={int(n)})",va="center",fontsize=8)
ax.set_xlim(0,1);ax.set_xlabel("Survival (alive/planted, pooled)");ax.set_title("Form 1 (Uganda) — survival by district")
plt.tight_layout();plt.savefig("out/fig1_form1_district.png");plt.close()

# 2 Form2 survival by species
fig,ax=plt.subplots(figsize=(6.5,3.8))
g=s2.groupby("species").apply(lambda x:pd.Series({"sr":pooled(x),"n":len(x)}),include_groups=False)
g=g[g["n"]>=50].sort_values("sr")
cols=[RUST if v<0.5 else (AMBER if v<0.6 else TEAL) for v in g["sr"]]
ax.barh([s[:26] for s in g.index],g["sr"],color=cols)
for i,(sr,n) in enumerate(zip(g["sr"],g["n"])): ax.text(sr+.01,i,f"{sr:.0%}",va="center",fontsize=8)
ax.set_xlim(0,.8);ax.set_xlabel("Survival (alive/planted, pooled)");ax.set_title("Form 2 (Kenya) — survival by species")
plt.tight_layout();plt.savefig("out/fig2_form2_species.png");plt.close()

# 3 growth perception vs actual survival (both)
fig,axes=plt.subplots(1,2,figsize=(9,3.3))
for ax,(nm,d,order) in zip(axes,[("Form 1 (UG)",s1,["Very poor","Poor","Same","Good","Very Good"]),
                                 ("Form 2 (KE)",s2,["Very Poor","Poor","Same","Good","Very Good"])]):
    g=d[d["growth_perception"].isin(order)].groupby("growth_perception")["sr"].median().reindex(order).dropna()
    ax.plot(range(len(g)),g.values,"o-",color=NAVY,lw=2,ms=7)
    ax.set_xticks(range(len(g)));ax.set_xticklabels([x.replace(" ","\n") for x in g.index],fontsize=8)
    ax.set_ylim(0,1.05);ax.set_ylabel("Median survival");ax.set_title(f"{nm}: perceived growth vs actual")
plt.tight_layout();plt.savefig("out/fig3_perception.png");plt.close()

# 4 Form2 survival by wave
fig,ax=plt.subplots(figsize=(5.5,3))
def wv(t):
    t=pd.to_datetime(t);y,m=t.year,t.month
    if y==2024 or (y==2025 and m<=1):return "W1\n2024Q4"
    if y==2025 and 5<=m<=8:return "W2\n2025mid"
    if y==2025 and m>=10:return "W3\n2025end"
    if y==2026 and m>=5:return "W4\n2026mid"
    return None
s2b=s2.copy();s2b["wave"]=s2b["sub_time"].apply(wv);s2b=s2b.dropna(subset=["wave"])
g=s2b.groupby("wave").apply(lambda x:pooled(x),include_groups=False).reindex(["W1\n2024Q4","W2\n2025mid","W3\n2025end","W4\n2026mid"])
ax.bar(range(len(g)),g.values,color=GREY);ax.set_xticks(range(len(g)));ax.set_xticklabels(g.index,fontsize=8)
ax.set_ylim(0,.75);ax.set_ylabel("Survival (pooled)");ax.set_title("Form 2 — survival by monitoring wave")
for i,v in enumerate(g.values):ax.text(i,v+.01,f"{v:.0%}",ha="center",fontsize=8)
plt.tight_layout();plt.savefig("out/fig4_form2_wave.png");plt.close()

print("charts written: fig1..fig4 in out/")
