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

// ── Tier grading ───────────────────────────────────────────────────────────
//
// Tiers are graded against a *distribution* of team scores rather than fixed
// sRaw cut-points. We model sRaw across a portfolio as approximately normal and
// assign a letter grade from each team's z-score. This keeps grades meaningful
// as the score formula (or projection source) shifts the absolute sRaw range,
// and it makes an "average" team land at the center of the scale (B/B-) with
// symmetric A/F tails.
//
// Reference distribution — the moments of a well-constructed best-ball team's
// sRaw, calibrated from the score formula's achievable range
// (sRaw = 0.65·sPos + 0.35·pCeil): centered ~0.38 with ~0.11 spread.
const REF_MEAN = 0.38
const REF_STD = 0.11
// Shrinkage strength. Portfolio moments earn full weight as team count grows;
// small portfolios lean on the reference so 3 teams aren't force-curved into a
// full A+…F spread.  w = n / (n + SHRINK_K).
const SHRINK_K = 25
// Floor on the effective σ so a portfolio of near-identical teams doesn't blow
// up z-scores (and divide-by-zero) over trivial score differences.
const MIN_STD = 0.05

export interface TierParams {
  mean: number
  std: number
}

/** The calibrated reference distribution, used when no portfolio is available. */
export const REFERENCE_TIER_PARAMS: TierParams = { mean: REF_MEAN, std: REF_STD }

/**
 * Blend a portfolio's sRaw moments toward the calibrated reference via
 * shrinkage, so tiers reflect the real distribution of team scores when the
 * portfolio is large, and a sensible fixed scale when it is small.
 */
export function computeTierParams(scores: number[]): TierParams {
  const n = scores.length
  if (n === 0) return { ...REFERENCE_TIER_PARAMS }

  const mean = scores.reduce((a, b) => a + b, 0) / n
  const variance =
    n > 1 ? scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0
  const std = Math.sqrt(variance)

  const w = n / (n + SHRINK_K) // 0 → all reference, 1 → all portfolio
  return {
    mean: w * mean + (1 - w) * REF_MEAN,
    std: Math.max(w * std + (1 - w) * REF_STD, MIN_STD),
  }
}

// z-score → letter grade cut-points. Centered so an average team (z ≈ 0) lands
// at B/B-, with roughly symmetric tails. Approx normal percentiles:
//   +1.75 ≈ 96th · +1.15 ≈ 87th · +0.65 ≈ 74th · +0.25 ≈ 60th
//   −0.25 ≈ 40th · −0.65 ≈ 26th · −1.15 ≈ 13th · −1.75 ≈ 4th
const TIER_Z_CUTS: [number, Tier][] = [
  [1.75, 'A+'],
  [1.15, 'A'],
  [0.65, 'A-'],
  [0.25, 'B+'],
  [-0.25, 'B'],
  [-0.65, 'B-'],
  [-1.15, 'C'],
  [-1.75, 'D'],
]

/**
 * Grade a single sRaw score against a (portfolio-aware) distribution.
 * Defaults to the calibrated reference distribution when no params are given,
 * so callers scoring a lone team still get a sensible absolute grade.
 */
export function toTier(sRaw: number, params: TierParams = REFERENCE_TIER_PARAMS): Tier {
  const std = params.std || MIN_STD
  const z = (sRaw - params.mean) / std
  for (const [cut, tier] of TIER_Z_CUTS) {
    if (z >= cut) return tier
  }
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
 *
 * Tier is graded against the portfolio's own sRaw distribution, shrunk toward a
 * calibrated reference (see computeTierParams) so a large portfolio is graded on
 * its real spread while a handful of teams isn't force-curved into a full
 * A+…F range. portfolioRank (1 = best) and percentile (100 = best) still
 * provide purely relative context.
 */
export function rankScores(raw: Map<string, TeamScoreComponents>): Map<string, TeamScore> {
  const entries = Array.from(raw.entries())
  const n = entries.length
  if (n === 0) return new Map()

  const params = computeTierParams(entries.map(([, c]) => c.sRaw))

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
      tier: toTier(components.sRaw, params),
    })
  })

  return result
}
