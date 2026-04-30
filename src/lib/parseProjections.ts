import Papa from 'papaparse'
import type { PlayerPrediction, SplitPrediction } from '@/hooks/usePredictions'

// ── Shared scoring constants ──────────────────────────────────────────────────

/** predRate ≈ (games × predAVG) / divisor, calibrated to match historical data */
const RATE_DIVISOR: Record<string, number> = {
  QB: 44,
  RB: 20,
  WR: 19,
  TE: 22,
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

function buildSplitPrediction(
  pts: number,
  games: number,
  position: string,
): SplitPrediction {
  const predAVG = pts / games
  const divisor = RATE_DIVISOR[position] ?? 22
  const mult = MAX_MULT[position] ?? 2.0
  return {
    games,
    predRate: (games * predAVG) / divisor,
    predAVG,
    predMax: predAVG * mult,
  }
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

/**
 * Parses the named-format projections CSV (projections.csv with firstname/lastname columns).
 * Returns a map keyed by fullName.toLowerCase().
 */
export function parseNamedProjections(csvText: string): Map<string, PlayerPrediction> {
  const parsed = Papa.parse<NewFormatRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  type SplitData = { pts: number; games: number; team: string; pos: string; first: string; last: string }
  const byId = new Map<string, Record<string, SplitData>>()

  for (const row of parsed.data) {
    const nflId = row.NFLNewsID?.trim()
    if (!nflId) continue
    const games = pf(row.GamesPlayed)
    if (games <= 0) continue

    if (!byId.has(nflId)) byId.set(nflId, {})
    byId.get(nflId)![row.Split] = {
      pts: computeFantasyPts(row),
      games,
      team: row.team?.trim() ?? '',
      pos: row.position?.trim() ?? '',
      first: row.firstname?.trim() ?? '',
      last: row.lastname?.trim() ?? '',
    }
  }

  const predByName = new Map<string, PlayerPrediction>()

  for (const entry of Array.from<[string, Record<string, SplitData>]>(
    byId as Map<string, Record<string, SplitData>>
  )) {
    const nflId = entry[0]
    const splits = entry[1]

    const ref = splits['M'] ?? splits['C'] ?? splits['F']
    if (!ref) continue

    const pos = ref.pos
    const fullName = `${ref.first} ${ref.last}`.trim()
    if (!fullName) continue

    const buildSplit = (key: string): SplitPrediction | null => {
      const s = splits[key]
      if (!s) return null
      return buildSplitPrediction(s.pts, s.games, pos)
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
      lastName: ref.last,
      fullName,
      position: pos,
      team: ref.team === 'NULL' ? '' : ref.team,
      stdDev,
      C,
      M,
      F,
    })
  }

  return predByName
}

// ── Legacy-format (2025_projections.csv) parser ───────────────────────────────
// No name columns; needs an external NFLNewsID → PlayerPrediction map for names.

/**
 * Parses the legacy projections CSV (underdogid format, no player names).
 * Names/positions come from pred26ByNFLId (indexed from the named projections).
 * predRate is scaled from the 2026 baseline by the ratio of projected season totals.
 */
export function parseLegacyProjections(
  csvText: string,
  pred26ByNFLId: Map<string, PlayerPrediction>,
): Map<string, PlayerPrediction> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  type SplitData = { pts: number; games: number }
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

  for (const entry of Array.from<[string, Record<string, SplitData>]>(
    byId as Map<string, Record<string, SplitData>>
  )) {
    const nflId = entry[0]
    const splits = entry[1]
    const p26 = pred26ByNFLId.get(nflId)
    if (!p26) continue

    const pos = p26.position
    const divisor = RATE_DIVISOR[pos] ?? 22
    const maxMult = MAX_MULT[pos] ?? 2.0

    const makeLegacySplit = (key: 'C' | 'M' | 'F'): SplitPrediction | null => {
      const s = splits[key]
      if (!s) return null
      const predAVG = s.pts / s.games
      const totalPts25 = s.pts
      const split26 = p26[key]
      let predRate: number
      if (split26 && split26.predRate > 0 && split26.predAVG > 0 && split26.games > 0) {
        predRate = split26.predRate * (totalPts25 / (split26.predAVG * split26.games))
      } else {
        predRate = totalPts25 / divisor
      }
      return { games: s.games, predRate, predAVG, predMax: predAVG * maxMult }
    }

    const C = makeLegacySplit('C')
    const M = makeLegacySplit('M')
    const F = makeLegacySplit('F')

    if (!M) continue

    const stdDev =
      C && F ? Math.max((C.predRate - F.predRate) / 1.349, 0) : M.predRate * 0.5

    predByName.set(p26.fullName.toLowerCase(), {
      NFLNewsID: parseInt(nflId),
      firstName: p26.firstName,
      lastName: p26.lastName,
      fullName: p26.fullName,
      position: pos,
      team: p26.team,
      stdDev,
      C,
      M,
      F,
    })
  }

  return predByName
}
