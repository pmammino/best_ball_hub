"""
Train gradient boosting models on season_stats.csv to predict Rate, AVG, Max.
Apply to projections.csv (Split="C") and write public/predictions.json.
"""

import json
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import r2_score

# ── Load data ─────────────────────────────────────────────────────────────────
ss = pd.read_csv("season_stats.csv", index_col=0)
proj = pd.read_csv("projections.csv", index_col=0)

# ── Feature mapping: season_stats col → projections col ──────────────────────
FEAT_MAP = {
    "games":       "GamesPlayed",
    "pass_att":    "PassAtt",
    "pass_comp":   "PassComp",
    "pass_yards":  "PassYard",
    "pass_td":     "PassTD",
    "int_thrown":  "PassInt",
    "rush_att":    "RushAtt",
    "rush_yards":  "RushYard",
    "rush_td":     "RushTD",
    "targets":     "Targets",
    "receptions":  "Receptions",
    "rec_yards":   "RecYard",
    "rec_td":      "RecTD",
}

SS_FEATS  = list(FEAT_MAP.keys())
PRJ_FEATS = list(FEAT_MAP.values())
TARGETS   = ["Rate", "AVG", "Max"]
POSITIONS = ["QB", "RB", "WR", "TE"]

# ── Prepare training data ─────────────────────────────────────────────────────
train = ss[ss["position"].isin(POSITIONS)].copy()
train[SS_FEATS] = train[SS_FEATS].fillna(0)
le = LabelEncoder().fit(POSITIONS)
train["pos_enc"] = le.transform(train["position"])

X_cols = SS_FEATS + ["pos_enc"]

# ── Train models ──────────────────────────────────────────────────────────────
models = {}
for target in TARGETS:
    X = train[X_cols].values
    y = train[target].values
    mdl = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    mdl.fit(X, y)
    r2 = r2_score(y, mdl.predict(X))
    print(f"  {target}: train R² = {r2:.3f}")
    models[target] = mdl

# ── Apply to projections (Split="C" only) ────────────────────────────────────
c_proj = proj[proj["Split"] == "C"].copy()
# Map FB to RB for model purposes
c_proj["pos_model"] = c_proj["position"].replace("FB", "RB")
c_proj = c_proj[c_proj["pos_model"].isin(POSITIONS)].copy()
c_proj[PRJ_FEATS] = c_proj[PRJ_FEATS].fillna(0)
c_proj["pos_enc"] = le.transform(c_proj["pos_model"])

X_proj = c_proj[PRJ_FEATS + ["pos_enc"]].values

predictions = {}
for target in TARGETS:
    raw = models[target].predict(X_proj)
    # Clamp to training range
    min_val, max_val = train[target].min(), train[target].max()
    predictions[target] = np.clip(raw, min_val, max_val).tolist()

# ── Build output ──────────────────────────────────────────────────────────────
records = []
for i, (idx, row) in enumerate(c_proj.iterrows()):
    records.append({
        "NFLNewsID":  int(row["NFLNewsID"]),
        "firstName":  str(row["firstname"]),
        "lastName":   str(row["lastname"]),
        "fullName":   f"{row['firstname']} {row['lastname']}",
        "position":   str(row["position"]),
        "team":       str(row["team"]) if pd.notna(row["team"]) and row["team"] != "NA" else "",
        "gamesPlayed": float(row["GamesPlayed"]),
        "predRate":   round(float(predictions["Rate"][i]), 2),
        "predAVG":    round(float(predictions["AVG"][i]), 2),
        "predMax":    round(float(predictions["Max"][i]), 2),
    })

out_path = "public/predictions.json"
with open(out_path, "w") as f:
    json.dump(records, f)

print(f"\nWrote {len(records)} predictions → {out_path}")
print("Sample:", records[:3])
