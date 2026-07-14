import type { DraftEntry } from './types'
import type { PlayerPrediction } from '@/hooks/usePredictions'
import { POSITIONAL_BENCHMARKS, exceedProb } from './roundBenchmarks'
import { simulateBestBall } from './simulateBestBall'

export type Tier = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C' | 'D' | 'F'

export interface TeamScoreComponents {
  pQB: number    // P(QB group ≥ benchmark)
  pRB: number
  pWR: number
  pTE: number
  pCeil: number  // P(lineup ≥ 160 pts)
  sPos: number   // weighted positional score after balance penalty
  sRaw: number   // final blended score (0–1 range)
}

export interface TeamScore extends TeamScoreComponents {
  percentile: number     // relative rank within portfolio (0–100; 100 = best)
  portfolioRank: number  // 1-indexed rank within portfolio (1 = best team)
  portfolioSize: number  // total teams in portfolio
  tier: Tier             // absolute grade based on sRaw, not relative rank
}

/** P that a single positional group exceeds the team-level benchmark. */
function positionalProb(
  entry: DraftEntry,
  getPred: (name: string) => PlayerPrediction | undefined,
  pos: string,
): number {
  let totalMedianRate = 0
  let sumSdSq = 0
  for (const pick of entry.picks) {
    if (pick.player.position !== pos) continue
    const pred = getPred(pick.player.fullName)
    const med = pred?.M
    if (med) totalMedianRate += med.predRate
    const sigma = pred?.stdDev ?? 0
    sumSdSq += sigma * sigma
  }
  if (totalMedianRate <= 0) return 0
  const benchmark = POSITIONAL_BENCHMARKS[pos]
  const posSD = Math.sqrt(sumSdSq)
  if (posSD <= 0) return totalMedianRate >= benchmark ? 1 : 0
  return exceedProb(totalMedianRate, posSD, benchmark) ?? 0
}

/**
 * Computes the raw team score components for a single entry.
 *
 * Positional score formula:
 *   p̄_w  = (P_QB + 1.25·P_RB + 1.25·P_WR + P_TE) / 4.5   (weighted mean)
 *   σ_p  = std(P_QB, P_RB, P_WR, P_TE)                      (unweighted balance signal)
 *   S_pos = p̄_w × (1 − σ_p)                                 (penalise imbalance)
 *
 * Final blend:
 *   S_raw = 0.65 × S_pos + 0.35 × P_ceil
 *
 * @param fastSims - Monte Carlo sim count for the ceiling probability (2 000 recommended
 *   for background scoring; use 50 000 in the detailed team view).
 */
export function computeTeamScore(
  entry: DraftEntry,
  getPred: (name: string) => PlayerPrediction | undefined,
  fastSims = 2_000,
): TeamScoreComponents {
  const pQB = positionalProb(entry, getPred, 'QB')
  const pRB = positionalProb(entry, getPred, 'RB')
  const pWR = positionalProb(entry, getPred, 'WR')
  const pTE = positionalProb(entry, getPred, 'TE')

  const pCeil = simulateBestBall(entry.picks, getPred, 160, fastSims).probability

  // Weighted mean: QB=1, RB=1.25, WR=1.25, TE=1 → sum=4.5
  const pWMean = (pQB + 1.25 * pRB + 1.25 * pWR + pTE) / 4.5

  // Balance multiplier via std of unweighted probabilities
  const uMean   = (pQB + pRB + pWR + pTE) / 4
  const variance = (
    (pQB - uMean) ** 2 +
    (pRB - uMean) ** 2 +
    (pWR - uMean) ** 2 +
    (pTE - uMean) ** 2
  ) / 4
  const sPos = pWMean * (1 - Math.sqrt(variance))

  const sRaw = 0.65 * sPos + 0.35 * pCeil

  return { pQB, pRB, pWR, pTE, pCeil, sPos, sRaw }
}

/**
 * Converts an absolute sRaw score to a tier grade.
 *
 * sRaw = 0.65 × sPos + 0.35 × pCeil; calibrated range:
 *   ~0.20 → very weak team (poor positional probs + low ceiling)
 *   ~0.38 → average well-constructed team
 *   ~0.52 → good team above average
 *   ~0.65+ → elite construction
 */
export function toTier(sRaw: number): Tier {
  if (sRaw >= 0.64) return 'A+'
  if (sRaw >= 0.57) return 'A'
  if (sRaw >= 0.50) return 'A-'
  if (sRaw >= 0.45) return 'B+'
  if (sRaw >= 0.39) return 'B'
  if (sRaw >= 0.33) return 'B-'
  if (sRaw >= 0.26) return 'C'
  if (sRaw >= 0.19) return 'D'
  return 'F'
}

/** Colour tokens for each tier. */
export const TIER_STYLE: Record<Tier, { text: string; bg: string; border: string }> = {
  'A+': { text: '#4ade80', bg: '#042318', border: '#4ade8050' }, // vivid green — top tier
  'A' : { text: '#34d399', bg: '#022c22', border: '#34d39950' }, // bright emerald
  'A-': { text: '#10b981', bg: '#052e16', border: '#10b98150' }, // emerald
  'B+': { text: '#22c55e', bg: '#052614', border: '#22c55e50' }, // green
  'B' : { text: '#a3e635', bg: '#1a2e05', border: '#a3e63550' }, // bright lime
  'B-': { text: '#84cc16', bg: '#152500', border: '#84cc1650' }, // lime
  'C' : { text: '#94a3b8', bg: '#1e293b', border: '#94a3b850' }, // slate — clearly distinct
  'D' : { text: '#fb923c', bg: '#431407', border: '#fb923c50' }, // orange
  'F' : { text: '#f87171', bg: '#450a0a', border: '#f8717150' }, // red
}

/**
 * Converts a map of raw scores into ranked TeamScore objects.
 * Tier is graded on absolute sRaw thresholds — not relative portfolio rank —
 * so a 3-team portfolio doesn't force an A+/B/F spread.
 * portfolioRank (1 = best) and percentile (100 = best) provide relative context.
 */
export function rankScores(raw: Map<string, TeamScoreComponents>): Map<string, TeamScore> {
  const entries = Array.from(raw.entries())
  const n = entries.length
  if (n === 0) return new Map()

  // Sort descending so index 0 = best team (rank 1)
  const sorted = [...entries].sort(([, a], [, b]) => b.sRaw - a.sRaw)
  const result  = new Map<string, TeamScore>()

  sorted.forEach(([id, components], idx) => {
    const portfolioRank = idx + 1
    const percentile = n === 1 ? 50 : Math.round(((n - 1 - idx) / (n - 1)) * 100)
    result.set(id, {
      ...components,
      percentile,
      portfolioRank,
      portfolioSize: n,
      tier: toTier(components.sRaw),
    })
  })

  return result
}
