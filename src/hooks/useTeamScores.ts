'use client'

import { useMemo } from 'react'
import type { DraftEntry } from '@/lib/types'
import type { PlayerPrediction } from './usePredictions'
import { computeTeamScore, rankScores, TeamScore } from '@/lib/scoreTeam'

export type { TeamScore }

/**
 * Computes a ranked team score for every entry in the portfolio.
 * Uses 2 000 Monte Carlo sims per team (fast pass; TeamDetail uses 50 000).
 * Memoised — only reruns when entries or getPred changes.
 */
export function useTeamScores(
  entries: DraftEntry[],
  getPred: (name: string) => PlayerPrediction | undefined,
): Map<string, TeamScore> {
  return useMemo(() => {
    if (entries.length === 0) return new Map()
    const raw = new Map()
    for (const entry of entries) {
      raw.set(entry.entryId, computeTeamScore(entry, getPred))
    }
    return rankScores(raw)
  }, [entries, getPred])
}
