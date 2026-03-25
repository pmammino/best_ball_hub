'use client'

import { useState, useEffect, useMemo } from 'react'

export type PredSplit = 'C' | 'M' | 'F'

export interface SplitPrediction {
  games: number
  predRate: number
  predAVG: number
  predMax: number
}

export interface PlayerPrediction {
  NFLNewsID: number
  firstName: string
  lastName: string
  fullName: string
  position: string
  team: string
  /** σ derived from (C_rate − F_rate) / 1.349  (75th–25th percentile spread) */
  stdDev: number | null
  C: SplitPrediction | null
  M: SplitPrediction | null
  F: SplitPrediction | null
}

export function usePredictions() {
  const [predictions, setPredictions] = useState<PlayerPrediction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/predictions.json')
      .then((r) => r.json())
      .then((data: PlayerPrediction[]) => {
        setPredictions(data)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load predictions')
        setIsLoading(false)
      })
  }, [])

  // Case-insensitive full-name lookup map
  const predByName = useMemo<Map<string, PlayerPrediction>>(() => {
    const map = new Map<string, PlayerPrediction>()
    for (const p of predictions) {
      map.set(p.fullName.toLowerCase(), p)
    }
    return map
  }, [predictions])

  function getPred(fullName: string): PlayerPrediction | undefined {
    return predByName.get(fullName.toLowerCase())
  }

  return { predictions, predByName, getPred, isLoading, error }
}
