import Papa from 'papaparse'
import type { PlayerPrediction, SplitPrediction } from '@/hooks/usePredictions'
import { type XGBModel, xgbPredict, buildRateFeatures } from './xgbRate'

// ── Fallback divisors (used when XGB models are not loaded) ────────────────────
const RATE_DIVISOR: Record<string, number> = {
  QB: 52,
  RB: 27,
  WR: 25,
  TE: 28,
}

/** predMax = predAVG × multiplier (position-specific boom/bust factor) */
const MAX_MULT: Record<string, number> = {
  QB: 1.80,
  RB: 2.20,
  WR: 2.30,
  TE: 2.40,
}

function pf(val: string | undefined): number {
  if (!val || val === 'NULL') return 0
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

/** Underdog half-PPR fantasy scoring from raw seasonal stat projections */
export function computeFantasyPts(row: Record<string, string>): number {
  return (
    pf(row.PassYard) * 0.04 +
    pf(row.PassTD) * 4 -
    pf(row.PassInt) * 1 +
    pf(row.Pass2PT) * 2 +
    pf(row.RushYard) * 0.1 +
    pf(row.RushTD) * 6 +
    pf(row.Rush2PT) * 2 +
    pf(row.Receptions) * 0.5 +
    pf(row.RecYard) * 0.1 +
    pf(row.RecTD) * 6 +
    pf(row.Rec2PT) * 2 -
    pf(row.FumblesLost) * 2
  )
}

interface RawStats {
  passAtt: number; passComp: number; passYards: number; passTD: number; passInt: number
  rushAtt: number; rushYards: number; rushTD: number
  targets: number; receptions: number; recYards: number; recTD: number
  fumblesLost: number
}

function extractStats(row: Record<string, string>): RawStats {
  return {
    passAtt:     pf(row.PassAtt),
    passComp:    pf(row.PassComp),
    passYards:   pf(row.PassYard),
    passTD:      pf(row.PassTD),
    passInt:     pf(row.PassInt),
    rushAtt:     pf(row.RushAtt),
    rushYards:   pf(row.RushYard),
    rushTD:      pf(row.RushTD),
    targets:     pf(row.Targets),
    receptions:  pf(row.Receptions),
    recYards:    pf(row.RecYard),
    recTD:       pf(row.RecTD),
    fumblesLost: pf(row.FumblesLost),
  }
}

function buildSplitPrediction(
  pts: number,
  games: number,
  position: string,
  stats: RawStats,
  models?: Map<string, XGBModel>,
): SplitPrediction {
  const predAVG = pts / games
  const mult = MAX_MULT[position] ?? 2.0
  let predRate: number
  const model = models?.get(position)
  if (model) {
    predRate = xgbPredict(model, buildRateFeatures(games, predAVG, stats))
  } else {
    predRate = (games * predAVG) / (RATE_DIVISOR[position] ?? 22)
  }
  return { games, predRate, predAVG, predMax: predAVG * mult }
}

// ── New-format projections.csv parser ─────────────────────────────────────────
// Columns: NFLNewsID, Season, Split, GamesPlayed, team, firstname, lastname,
//          position, PassAtt, PassComp, PassYard, PassTD, PassInt,
//          RushAtt, RushYard, RushTD, Targets, Receptions, RecYard, RecTD

interface NewFormatRow {
  NFLNewsID: string
  Split: string
  GamesPlayed: string
  team: string
  firstname: string
  lastname: string
  position: string
  [key: string]: string
}

type SplitData = {
  pts: number
  games: number
  stats: RawStats
  team: string
  pos: string
  first: string
  last: string
}

/**
 * Parses the named-format projections CSV.
 * Pass `models` (from loadXGBModels()) to use XGBoost Rate predictions;
 * omit to fall back to the divisor formula.
 */
export function parseNamedProjections(
  csvText: string,
  models?: Map<string, XGBModel>,
): Map<string, PlayerPrediction> {
  const parsed = Papa.parse<NewFormatRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const byId = new Map<string, Record<string, SplitData>>()

  for (const row of parsed.data) {
    const nflId = row.NFLNewsID?.trim()
    if (!nflId) continue
    const games = pf(row.GamesPlayed)
    if (games <= 0) continue

    if (!byId.has(nflId)) byId.set(nflId, {})
    byId.get(nflId)![row.Split] = {
      pts:   computeFantasyPts(row),
      games,
      stats: extractStats(row),
      team:  row.team?.trim() ?? '',
      pos:   row.position?.trim() ?? '',
      first: row.firstname?.trim() ?? '',
      last:  row.lastname?.trim() ?? '',
    }
  }

  const predByName = new Map<string, PlayerPrediction>()

  for (const [nflId, splits] of Array.from(byId)) {
    const ref = splits['M'] ?? splits['C'] ?? splits['F']
    if (!ref) continue

    const pos      = ref.pos
    const fullName = `${ref.first} ${ref.last}`.trim()
    if (!fullName) continue

    const buildSplit = (key: string): SplitPrediction | null => {
      const s = splits[key]
      if (!s) return null
      return buildSplitPrediction(s.pts, s.games, pos, s.stats, models)
    }

    const C = buildSplit('C')
    const M = buildSplit('M')
    const F = buildSplit('F')
    if (!M) continue

    const stdDev =
      C && F ? Math.max((C.predRate - F.predRate) / 1.349, 0) : M.predRate * 0.5

    predByName.set(fullName.toLowerCase(), {
      NFLNewsID: parseInt(nflId),
      firstName: ref.first,
      lastName:  ref.last,
      fullName,
      position:  pos,
      team:      ref.team === 'NULL' ? '' : ref.team,
      stdDev,
      C,
      M,
      F,
    })
  }

  return predByName
}
