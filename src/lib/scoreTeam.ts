import type { DraftEntry } from './types'
import type { PlayerPrediction } from '@/hooks/usePredictions'
import { POSITIONAL_BENCHMARKS, exceedProb } from './roundBenchmarks'
import { simulateBestBall } from './simulateBestBall'

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

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
  percentile: number  // rank within current portfolio (0–100)
  tier: Tier
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

export function toTier(percentile: number): Tier {
  if (percentile >= 90) return 'S'
  if (percentile >= 75) return 'A'
  if (percentile >= 55) return 'B'
  if (percentile >= 35) return 'C'
  if (percentile >= 15) return 'D'
  return 'F'
}

/** Converts a map of raw scores into ranked TeamScore objects (percentile within portfolio). */
export function rankScores(raw: Map<string, TeamScoreComponents>): Map<string, TeamScore> {
  const entries = Array.from(raw.entries())
  const n = entries.length
  if (n === 0) return new Map()

  // Sort ascending so rank 0 = worst → 0th percentile
  const sorted = [...entries].sort(([, a], [, b]) => a.sRaw - b.sRaw)
  const result  = new Map<string, TeamScore>()

  sorted.forEach(([id, components], rank) => {
    const percentile = n === 1 ? 50 : Math.round((rank / (n - 1)) * 100)
    result.set(id, { ...components, percentile, tier: toTier(percentile) })
  })

  return result
}
