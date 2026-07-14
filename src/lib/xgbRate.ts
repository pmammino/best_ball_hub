/**
 * XGBoost Rate model evaluator.
 *
 * Models are trained offline (tools/train_xgb_rate.py) and stored in
 * public/models/xgb_rate_{pos}.json.  Inference is a tree-walk sum —
 * no external deps required.
 *
 * Features (all per-game except 'games' itself):
 *   ppg, games, pass_att_pg, pass_comp_pg, pass_yards_pg, pass_td_pg,
 *   int_thrown_pg, rush_att_pg, rush_yards_pg, rush_td_pg,
 *   targets_pg, receptions_pg, rec_yards_pg, rec_td_pg, fumbles_lost_pg
 */

/** One node: leaf has only `v`, internal has f/c/y/n/m. */
interface XGBNode {
  v?: number           // leaf value
  f?: number           // feature index
  c?: number           // split condition
  y?: number           // yes child nodeid
  n?: number           // no child nodeid
  m?: number           // missing child nodeid
}

export interface XGBModel {
  feats:      string[]
  base_score: number
  trees:      (XGBNode | null)[][]
}

/** Evaluate one tree starting from nodeid 0. */
function evalTree(nodes: (XGBNode | null)[], feat: number[]): number {
  let id = 0
  for (;;) {
    const node = nodes[id]
    if (!node || node.v !== undefined) return node?.v ?? 0
    const val = feat[node.f!]
    // XGBoost: go "yes" if val < split_condition, else "no" (missing follows "missing" child)
    if (val === undefined || val === null || isNaN(val)) {
      id = node.m!
    } else if (val < node.c!) {
      id = node.y!
    } else {
      id = node.n!
    }
  }
}

/**
 * Predict Rate (usable weeks, 0–17) given a feature record.
 * Returns base_score + sum of all tree leaf values.
 */
export function xgbPredict(model: XGBModel, featVals: Record<string, number>): number {
  const feat = model.feats.map(f => featVals[f] ?? 0)
  let score = model.base_score
  for (const tree of model.trees) score += evalTree(tree, feat)
  return Math.max(0, Math.min(17, score))
}

/** Load all four positional models in parallel. */
// Module-level singleton — fetched and parsed at most once per page session,
// so the four JSON files are only fetched/parsed once no matter how many
// consumers call loadXGBModels().
let _modelPromise: Promise<Map<string, XGBModel>> | null = null

export function loadXGBModels(): Promise<Map<string, XGBModel>> {
  if (!_modelPromise) {
    const positions = ['QB', 'RB', 'WR', 'TE'] as const
    _modelPromise = Promise.all(
      positions.map(pos =>
        fetch(`/models/xgb_rate_${pos}.json`).then(r => r.json() as Promise<XGBModel>)
      )
    ).then(results => {
      const map = new Map<string, XGBModel>()
      positions.forEach((pos, i) => map.set(pos, results[i]))
      return map
    })
  }
  return _modelPromise
}

/**
 * Build a feature record from per-game projection stats.
 * stat totals (season-level) and games must be passed in.
 */
export function buildRateFeatures(
  games: number,
  ppg: number,
  stats: {
    passAtt?: number; passComp?: number; passYards?: number; passTD?: number; passInt?: number
    rushAtt?: number; rushYards?: number; rushTD?: number
    targets?: number; receptions?: number; recYards?: number; recTD?: number
    fumblesLost?: number
  },
): Record<string, number> {
  const g = games || 1
  return {
    ppg,
    games,
    pass_att_pg:     (stats.passAtt     ?? 0) / g,
    pass_comp_pg:    (stats.passComp    ?? 0) / g,
    pass_yards_pg:   (stats.passYards   ?? 0) / g,
    pass_td_pg:      (stats.passTD      ?? 0) / g,
    int_thrown_pg:   (stats.passInt     ?? 0) / g,
    rush_att_pg:     (stats.rushAtt     ?? 0) / g,
    rush_yards_pg:   (stats.rushYards   ?? 0) / g,
    rush_td_pg:      (stats.rushTD      ?? 0) / g,
    targets_pg:      (stats.targets     ?? 0) / g,
    receptions_pg:   (stats.receptions  ?? 0) / g,
    rec_yards_pg:    (stats.recYards    ?? 0) / g,
    rec_td_pg:       (stats.recTD       ?? 0) / g,
    fumbles_lost_pg: (stats.fumblesLost ?? 0) / g,
  }
}
