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

  // Normalization helpers
  function stripSuffix(name: string): string {
    return name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').trim()
  }
  function stripPeriods(name: string): string {
    return name.replace(/\./g, '').replace(/\s+/g, ' ').trim()
  }
  function normalize(name: string): string {
    return stripSuffix(stripPeriods(name)).toLowerCase()
  }

  // Build multiple lookup maps: exact → no-periods → no-suffix → both
  const { predByName, predByNorm, predByLastFirst } = useMemo(() => {
    const predByName      = new Map<string, PlayerPrediction>()
    const predByNorm      = new Map<string, PlayerPrediction>()
    const predByLastFirst = new Map<string, PlayerPrediction>()

    for (const p of predictions) {
      const exact = p.fullName.toLowerCase()
      predByName.set(exact, p)
      predByNorm.set(normalize(p.fullName), p)

      // last,firstInitial key e.g. "moore,d" for DJ Moore
      const parts = p.fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last  = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
        const first = parts[0].toLowerCase().replace(/\./g, '')
        predByLastFirst.set(`${last},${first[0]}`, p)
      }
    }
    return { predByName, predByNorm, predByLastFirst }
  }, [predictions])

  function getPred(fullName: string): PlayerPrediction | undefined {
    // 1. Exact case-insensitive
    const exact = fullName.toLowerCase()
    if (predByName.has(exact)) return predByName.get(exact)

    // 2. Normalize: strip periods in initials + strip name suffix
    const normed = normalize(fullName)
    if (predByNorm.has(normed)) return predByNorm.get(normed)

    // 3. Last-name + first-initial (catches e.g. "D.J." vs "DJ" after normalization)
    const parts = fullName.trim().split(/\s+/)
    if (parts.length >= 2) {
      const last  = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
      const first = parts[0].toLowerCase().replace(/\./g, '')
      const key   = `${last},${first[0]}`
      if (predByLastFirst.has(key)) return predByLastFirst.get(key)
    }

    return undefined
  }

  return { predictions, predByName, predByNorm, predByLastFirst, getPred, isLoading, error }
}
