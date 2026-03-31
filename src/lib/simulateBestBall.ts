import type { Pick } from './types'
import type { PlayerPrediction } from '@/hooks/usePredictions'

export interface SimResult {
  probability: number    // P(single-week lineup ≥ threshold)
  expectedScore: number  // mean weekly lineup score
  medianScore: number
  p10: number
  p25: number
  p75: number
  p90: number
  threshold: number
}

/** Box-Muller: returns a single N(0,1) sample */
function randn(): number {
  const u1 = Math.random() || 1e-10
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

export function simulateBestBall(
  picks: Pick[],
  getPred: (name: string) => PlayerPrediction | undefined,
  threshold = 180,
  sims = 50_000,
): SimResult {
  // Build per-player params:
  //   mean  = M.predAVG (median projection)
  //   sigma = average of (predMax − predAVG) across all available splits (C/M/F)
  type PlayerParam = { pos: string; mean: number; sigma: number }
  const players: PlayerParam[] = picks.map(pick => {
    const pred   = getPred(pick.player.fullName)
    const mean   = pred?.M?.predAVG ?? 0
    const splits = [pred?.C, pred?.M, pred?.F].filter((s): s is NonNullable<typeof s> => !!s)
    const diffs  = splits.map(s => s.predMax - s.predAVG)
    const sigma  = diffs.length > 0
      ? Math.max(diffs.reduce((a, b) => a + b, 0) / diffs.length, 0.01)
      : Math.max(mean * 0.5, 0.01)
    return { pos: pick.player.position, mean, sigma }
  })

  const qbs = players.filter(p => p.pos === 'QB')
  const rbs = players.filter(p => p.pos === 'RB')
  const wrs = players.filter(p => p.pos === 'WR')
  const tes = players.filter(p => p.pos === 'TE')

  const scores = new Float32Array(sims)

  for (let s = 0; s < sims; s++) {
    const qbS = qbs.map(p => Math.max(0, p.mean + p.sigma * randn()))
    const rbS = rbs.map(p => Math.max(0, p.mean + p.sigma * randn()))
    const wrS = wrs.map(p => Math.max(0, p.mean + p.sigma * randn()))
    const teS = tes.map(p => Math.max(0, p.mean + p.sigma * randn()))

    qbS.sort((a, b) => b - a)
    rbS.sort((a, b) => b - a)
    wrS.sort((a, b) => b - a)
    teS.sort((a, b) => b - a)

    // Best lineup: 1 QB + 2 RB + 3 WR + 1 TE + 1 FLEX (best remaining RB/WR/TE)
    let score = 0
    score += qbS[0] ?? 0
    score += (rbS[0] ?? 0) + (rbS[1] ?? 0)
    score += (wrS[0] ?? 0) + (wrS[1] ?? 0) + (wrS[2] ?? 0)
    score += teS[0] ?? 0
    score += Math.max(rbS[2] ?? 0, wrS[3] ?? 0, teS[1] ?? 0)

    scores[s] = score
  }

  scores.sort()

  let exceeded = 0
  let total = 0
  for (let i = 0; i < sims; i++) {
    total += scores[i]
    if (scores[i] >= threshold) exceeded++
  }

  return {
    probability:   exceeded / sims,
    expectedScore: total / sims,
    medianScore:   scores[Math.floor(sims * 0.50)],
    p10:           scores[Math.floor(sims * 0.10)],
    p25:           scores[Math.floor(sims * 0.25)],
    p75:           scores[Math.floor(sims * 0.75)],
    p90:           scores[Math.floor(sims * 0.90)],
    threshold,
  }
}
