import type { Pick, Player } from './types'
import type { PlayerPrediction } from '@/hooks/usePredictions'

export interface SimResult {
  probability: number    // P(single-week lineup ≥ threshold)
  expectedScore: number
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

/**
 * Monte Carlo best-ball ceiling simulation.
 *
 * @param gameMap  Optional map of nflTeam → gameKey. When provided, players in the
 *   same game share a correlated pace factor (σ_game = 3 pts), modelling the
 *   tendency for high-scoring games to lift all fantasy players in that game.
 *   Intra-game correlation ≈ 20% at typical player-σ of ~7 pts.
 */
export function simulateBestBall(
  picks: Pick[],
  getPred: (player: Player) => PlayerPrediction | undefined,
  threshold = 160,
  sims = 50_000,
  gameMap?: Map<string, string>,
): SimResult {
  const GAME_SIGMA = 3.0  // shared game-pace noise (pts)

  type PlayerParam = { pos: string; mean: number; sigma: number; gameIdx: number }

  // Build unique game keys and a fast index for each player
  const teamToKey = gameMap ?? new Map<string, string>()
  const uniqueKeys: string[] = []
  const keyIndex = new Map<string, number>()
  for (const pick of picks) {
    const key = teamToKey.get(pick.player.nflTeam)
    if (key && !keyIndex.has(key)) {
      keyIndex.set(key, uniqueKeys.length)
      uniqueKeys.push(key)
    }
  }

  const players: PlayerParam[] = picks.map(pick => {
    const pred = getPred(pick.player)
    const mean = pred?.M?.predAVG ?? 0
    const splits = [pred?.C, pred?.M, pred?.F].filter((s): s is NonNullable<typeof s> => !!s)
    const diffs = splits.map(s => s.predMax - s.predAVG)
    const sigma = diffs.length > 0
      ? Math.max(diffs.reduce((a, b) => a + b, 0) / diffs.length, 0.01)
      : Math.max(mean * 0.5, 0.01)
    const key = teamToKey.get(pick.player.nflTeam)
    const gameIdx = key !== undefined ? (keyIndex.get(key) ?? -1) : -1
    return { pos: pick.player.position, mean, sigma, gameIdx }
  })

  // Pre-group by position index (faster inner loop)
  const qbIdx: number[] = [], rbIdx: number[] = [], wrIdx: number[] = [], teIdx: number[] = []
  players.forEach((p, i) => {
    if (p.pos === 'QB') qbIdx.push(i)
    else if (p.pos === 'RB') rbIdx.push(i)
    else if (p.pos === 'WR') wrIdx.push(i)
    else if (p.pos === 'TE') teIdx.push(i)
  })

  const scores = new Float32Array(sims)
  const gf = new Float64Array(uniqueKeys.length)
  const pScores = new Float64Array(players.length)

  for (let s = 0; s < sims; s++) {
    for (let g = 0; g < uniqueKeys.length; g++) gf[g] = GAME_SIGMA * randn()

    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      const gameFactor = p.gameIdx >= 0 ? gf[p.gameIdx] : 0
      pScores[i] = Math.max(0, p.mean + p.sigma * randn() + gameFactor)
    }

    const qbS = qbIdx.map(i => pScores[i]).sort((a, b) => b - a)
    const rbS = rbIdx.map(i => pScores[i]).sort((a, b) => b - a)
    const wrS = wrIdx.map(i => pScores[i]).sort((a, b) => b - a)
    const teS = teIdx.map(i => pScores[i]).sort((a, b) => b - a)

    scores[s] =
      (qbS[0] ?? 0) +
      (rbS[0] ?? 0) + (rbS[1] ?? 0) +
      (wrS[0] ?? 0) + (wrS[1] ?? 0) + (wrS[2] ?? 0) +
      (teS[0] ?? 0) +
      Math.max(rbS[2] ?? 0, wrS[3] ?? 0, teS[1] ?? 0)
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
