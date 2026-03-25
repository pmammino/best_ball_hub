"""
Train gradient boosting models on season_stats.csv to predict Rate, AVG, Max.
Applies to all three splits (C=Ceiling, M=Median, F=Floor) in projections.csv.
Outputs public/predictions.json — one entry per player with predictions for each split.
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
SPLITS    = ["C", "M", "F"]

# ── Prepare training data ─────────────────────────────────────────────────────
train = ss[ss["position"].isin(POSITIONS)].copy()
train[SS_FEATS] = train[SS_FEATS].fillna(0)
le = LabelEncoder().fit(POSITIONS)
train["pos_enc"] = le.transform(train["position"])

X_cols = SS_FEATS + ["pos_enc"]

# ── Train one model per target ────────────────────────────────────────────────
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

train_min = {t: train[t].min() for t in TARGETS}
train_max = {t: train[t].max() for t in TARGETS}

# ── Helper: predict one split dataframe ──────────────────────────────────────
def predict_split(df: pd.DataFrame) -> dict:
    df = df.copy()
    df["pos_model"] = df["position"].replace("FB", "RB")
    df = df[df["pos_model"].isin(POSITIONS)].copy()
    df[PRJ_FEATS] = df[PRJ_FEATS].fillna(0)
    df["pos_enc"] = le.transform(df["pos_model"])
    X = df[PRJ_FEATS + ["pos_enc"]].values
    result = {}
    for target in TARGETS:
        raw = models[target].predict(X)
        result[target] = np.clip(raw, train_min[target], train_max[target])
    # Return dict keyed by original index
    out = {}
    for i, idx in enumerate(df.index):
        out[idx] = {
            "games":   float(df.loc[idx, "GamesPlayed"]),
            "predRate": round(float(result["Rate"][i]), 2),
            "predAVG":  round(float(result["AVG"][i]), 2),
            "predMax":  round(float(result["Max"][i]), 2),
        }
    return out

split_preds = {}
for split in SPLITS:
    split_df = proj[proj["Split"] == split]
    split_preds[split] = predict_split(split_df)
    print(f"  Split {split}: {len(split_preds[split])} players predicted")

# ── Build output — one entry per player (using C split as base identity) ─────
c_proj = proj[proj["Split"] == "C"].copy()
c_proj["pos_model"] = c_proj["position"].replace("FB", "RB")
c_proj = c_proj[c_proj["pos_model"].isin(POSITIONS)].copy()

records = []
for idx, row in c_proj.iterrows():
    player_splits = {}
    for split in SPLITS:
        if idx in split_preds[split]:
            player_splits[split] = split_preds[split][idx]
        else:
            # Try to find same player in other split by NFLNewsID
            same = proj[(proj["NFLNewsID"] == row["NFLNewsID"]) & (proj["Split"] == split)]
            if not same.empty:
                player_splits[split] = predict_split(same).get(same.index[0], None)

    records.append({
        "NFLNewsID":  int(row["NFLNewsID"]),
        "firstName":  str(row["firstname"]),
        "lastName":   str(row["lastname"]),
        "fullName":   f"{row['firstname']} {row['lastname']}",
        "position":   str(row["position"]),
        "team":       str(row["team"]) if pd.notna(row["team"]) and row["team"] != "NA" else "",
        "C": player_splits.get("C"),
        "M": player_splits.get("M"),
        "F": player_splits.get("F"),
    })

out_path = "public/predictions.json"
with open(out_path, "w") as f:
    json.dump(records, f)

print(f"\nWrote {len(records)} player predictions ({len(SPLITS)} splits each) → {out_path}")
sample = records[0]
print(f"Sample: {sample['fullName']} | C:{sample['C']} | M:{sample['M']} | F:{sample['F']}")
