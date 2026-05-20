"""
Train per-position XGBoost Rate-prediction models from season_stats.csv.
Exports compact JSON trees to public/models/xgb_rate_{pos}.json.

Feature set matches what is available in projections.csv at inference time:
  ppg, games, PassAtt, PassComp, PassYard, PassTD, PassInt,
  RushAtt, RushYard, RushTD, Targets, Receptions, RecYard, RecTD
  (all per-game except games itself)
"""

import csv, json, math, os, sys
import numpy as np
import xgboost as xgb
from sklearn.model_selection import KFold
from sklearn.metrics import r2_score, mean_absolute_error

SEASON_STATS = os.path.join(os.path.dirname(__file__), '..', 'season_stats.csv')
OUT_DIR      = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')

# Feature names — must match projection CSV column names (case-insensitive map below)
FEATURES = [
    'ppg',           # computed: total_pts / games
    'games',
    'pass_att_pg',
    'pass_comp_pg',
    'pass_yards_pg',
    'pass_td_pg',
    'int_thrown_pg',
    'rush_att_pg',
    'rush_yards_pg',
    'rush_td_pg',
    'targets_pg',
    'receptions_pg',
    'rec_yards_pg',
    'rec_td_pg',
    'fumbles_lost_pg',
]

XGB_PARAMS = dict(
    n_estimators    = 200,
    max_depth       = 4,
    learning_rate   = 0.05,
    subsample       = 0.85,
    colsample_bytree= 0.85,
    reg_lambda      = 1.0,
    random_state    = 42,
    verbosity       = 0,
)

def safe_float(v, default=0.0):
    try:
        x = float(v)
        return x if math.isfinite(x) else default
    except (ValueError, TypeError):
        return default

def load_data():
    rows = {pos: [] for pos in ('QB', 'RB', 'WR', 'TE')}
    with open(SEASON_STATS) as f:
        reader = csv.DictReader(f)
        for row in reader:
            pos = row['position'].strip()
            if pos not in rows:
                continue
            games = safe_float(row['games'])
            rate  = safe_float(row['Rate'])
            avg   = safe_float(row['AVG'])
            if games <= 0 or avg <= 0 or rate < 0 or rate > games:
                continue
            g = games
            rec = {
                'rate':           rate,
                'ppg':            avg,
                'games':          g,
                'pass_att_pg':    safe_float(row.get('pass_att'))    / g,
                'pass_comp_pg':   safe_float(row.get('pass_comp'))   / g,
                'pass_yards_pg':  safe_float(row.get('pass_yards'))  / g,
                'pass_td_pg':     safe_float(row.get('pass_td'))     / g,
                'int_thrown_pg':  safe_float(row.get('int_thrown'))  / g,
                'rush_att_pg':    safe_float(row.get('rush_att'))    / g,
                'rush_yards_pg':  safe_float(row.get('rush_yards'))  / g,
                'rush_td_pg':     safe_float(row.get('rush_td'))     / g,
                'targets_pg':     safe_float(row.get('targets'))     / g,
                'receptions_pg':  safe_float(row.get('receptions'))  / g,
                'rec_yards_pg':   safe_float(row.get('rec_yards'))   / g,
                'rec_td_pg':      safe_float(row.get('rec_td'))      / g,
                'fumbles_lost_pg':safe_float(row.get('fumblesLost')) / g,
            }
            rows[pos].append(rec)
    return rows

def build_arrays(records):
    X = np.array([[r[f] for f in FEATURES] for r in records])
    y = np.array([r['rate'] for r in records])
    return X, y

def cv_score(X, y):
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    r2s, maes = [], []
    for tr, te in kf.split(X):
        m = xgb.XGBRegressor(**XGB_PARAMS, feature_names=FEATURES)
        m.fit(X[tr], y[tr])
        p = m.predict(X[te])
        r2s.append(r2_score(y[te], p))
        maes.append(mean_absolute_error(y[te], p))
    return float(np.mean(r2s)), float(np.mean(maes))

def flatten_tree(node, out_nodes):
    """Recursively flatten XGBoost tree JSON into a list indexed by nodeid."""
    idx = node['nodeid']
    while len(out_nodes) <= idx:
        out_nodes.append(None)
    if 'leaf' in node:
        out_nodes[idx] = {'v': round(node['leaf'], 6)}
    else:
        out_nodes[idx] = {
            'f': FEATURES.index(node['split']),
            'c': round(node['split_condition'], 6),
            'y': node['yes'],
            'n': node['no'],
            'm': node['missing'],
        }
        for child in node.get('children', []):
            flatten_tree(child, out_nodes)
    return out_nodes

def export_model(model):
    booster = model.get_booster()
    booster.feature_names = FEATURES  # ensure names appear in tree dump
    # Extract fitted base_score from booster JSON
    raw = json.loads(booster.save_raw('json'))
    raw_bs = raw['learner']['learner_model_param']['base_score']
    # XGBoost 2.x wraps the value in brackets like '[2.362857E0]'
    base_score = float(str(raw_bs).strip('[]'))

    tree_dumps = booster.get_dump(dump_format='json', with_stats=False)
    compact_trees = []
    for td in tree_dumps:
        tree_json = json.loads(td)
        nodes = flatten_tree(tree_json, [])
        compact_trees.append(nodes)

    return {
        'feats':      FEATURES,
        'base_score': round(base_score, 6),
        'trees':      compact_trees,
    }

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    data = load_data()

    print(f"{'Pos':>4}  {'n':>5}  {'CV R²':>8}  {'CV MAE':>8}  {'File size':>10}")
    print('─' * 50)

    for pos in ('QB', 'RB', 'WR', 'TE'):
        records = data[pos]
        X, y = build_arrays(records)
        r2, mae = cv_score(X, y)

        # Train final model on all data
        model = xgb.XGBRegressor(**XGB_PARAMS, feature_names=FEATURES)
        model.fit(X, y)

        exported = export_model(model)
        out_path = os.path.join(OUT_DIR, f'xgb_rate_{pos}.json')
        with open(out_path, 'w') as f:
            json.dump(exported, f, separators=(',', ':'))

        size_kb = os.path.getsize(out_path) / 1024
        print(f'{pos:>4}  {len(records):>5}  {r2:>8.4f}  {mae:>8.3f}  {size_kb:>8.1f} KB')

        # Print top feature importances
        imp = model.feature_importances_
        top = sorted(zip(FEATURES, imp), key=lambda x: -x[1])[:5]
        print(f'       top feats: ' + ', '.join(f'{n}({v:.3f})' for n, v in top))

    print(f'\nModels written to: {OUT_DIR}')

if __name__ == '__main__':
    main()
