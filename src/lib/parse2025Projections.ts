import Papa from 'papaparse'
import type { PlayerPrediction, SplitPrediction } from '@/hooks/usePredictions'

interface RawProjRow {
  NFLNewsID: string
  Split: string
  GamesPlayed: string
  PassYard: string
  PassTD: string
  PassInt: string
  Pass2PT: string
  RushYard: string
  RushTD: string
  Rush2PT: string
  Receptions: string
  RecYard: string
  RecTD: string
  Rec2PT: string
  FumblesLost: string
  [key: string]: string
}

type SplitData = { pts: number; games: number }

function pf(val: string | undefined): number {
  if (!val || val === 'NULL') return 0
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

function computeFantasyPts(row: RawProjRow): number {
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

const PRED_MAX_MULT: Record<string, number> = {
  QB: 1.80,
  RB: 2.20,
  WR: 2.30,
  TE: 2.40,
}

// Fallback divisors for players without 2026 data (predRate ≈ totalPts / divisor)
const FALLBACK_RATE_DIVISOR: Record<string, number> = {
  QB: 44,
  RB: 20,
  WR: 19,
  TE: 22,
}

function computeRate(
  splitData: SplitData,
  split26: SplitPrediction | null | undefined,
  fallbackDiv: number,
): number {
  const predAVG_2025 = splitData.pts / splitData.games
  const totalPts_2025 = predAVG_2025 * splitData.games
  if (split26 && split26.predRate > 0 && split26.predAVG > 0 && split26.games > 0) {
    const totalPts_2026 = split26.predAVG * split26.games
    return split26.predRate * (totalPts_2025 / totalPts_2026)
  }
  return totalPts_2025 / fallbackDiv
}

function buildSplit(
  s: SplitData | undefined,
  split26: SplitPrediction | null | undefined,
  maxMult: number,
  fallbackDiv: number,
): SplitPrediction | null {
  if (!s) return null
  const predAVG = s.pts / s.games
  return {
    games: s.games,
    predRate: computeRate(s, split26, fallbackDiv),
    predAVG,
    predMax: predAVG * maxMult,
  }
}

/**
 * Parses 2025 projections CSV and builds a name-keyed PlayerPrediction map.
 *
 * Join strategy: 2025_projections.csv → predictions.json via NFLNewsID.
 * predRate is derived by scaling each player's 2026 predRate by the ratio of
 * projected 2025 vs 2026 season totals (predAVG × games), preserving
 * player-specific calibration while reflecting the 2025 scenario.
 */
export function parse2025Projections(
  csvText: string,
  pred26: PlayerPrediction[],
): Map<string, PlayerPrediction> {
  const pred26ById = new Map<string, PlayerPrediction>()
  for (const p of pred26) {
    pred26ById.set(String(p.NFLNewsID), p)
  }

  const parsed = Papa.parse<RawProjRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const byId = new Map<string, Record<string, SplitData>>()
  for (const row of parsed.data) {
    const nflId = row.NFLNewsID?.trim()
    if (!nflId) continue
    const games = pf(row.GamesPlayed)
    if (games <= 0) continue
    if (!byId.has(nflId)) byId.set(nflId, {})
    byId.get(nflId)![row.Split] = { pts: computeFantasyPts(row), games }
  }

  const predByName = new Map<string, PlayerPrediction>()

  for (const entry of Array.from(byId.entries())) {
    const nflId = entry[0]
    const splits = entry[1]
    const p26 = pred26ById.get(nflId)
    if (!p26) continue

    const pos = p26.position
    const maxMult = PRED_MAX_MULT[pos] ?? 2.0
    const fallbackDiv = FALLBACK_RATE_DIVISOR[pos] ?? 22

    const C = buildSplit(splits['C'], p26.C, maxMult, fallbackDiv)
    const M = buildSplit(splits['M'], p26.M, maxMult, fallbackDiv)
    const F = buildSplit(splits['F'], p26.F, maxMult, fallbackDiv)

    if (!M) continue

    const stdDev =
      C && F ? Math.max((C.predRate - F.predRate) / 1.349, 0) : M.predRate * 0.5

    predByName.set(p26.fullName.toLowerCase(), {
      NFLNewsID: parseInt(nflId),
      firstName: p26.firstName,
      lastName: p26.lastName,
      fullName: p26.fullName,
      position: p26.position,
      team: p26.team,
      stdDev,
      C,
      M,
      F,
    })
  }

  return predByName
}
