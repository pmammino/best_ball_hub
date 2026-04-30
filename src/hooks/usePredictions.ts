'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'

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

// Module-level helpers — no closure over state, stable references
function stripSuffix(name: string): string {
  return name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').trim()
}
function stripSpecialChars(name: string): string {
  return name.replace(/[.']/g, '').replace(/\s+/g, ' ').trim()
}
function normalizeName(name: string): string {
  return stripSuffix(stripSpecialChars(name)).toLowerCase()
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

  const { predByName, predByNorm, predByLastFirst } = useMemo(() => {
    const predByName      = new Map<string, PlayerPrediction>()
    const predByNorm      = new Map<string, PlayerPrediction>()
    const predByLastFirst = new Map<string, PlayerPrediction>()

    for (const p of predictions) {
      const exact = p.fullName.toLowerCase()
      predByName.set(exact, p)
      predByNorm.set(normalizeName(p.fullName), p)

      const parts = p.fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last  = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
        const first = parts[0].toLowerCase().replace(/\./g, '')
        predByLastFirst.set(`${last},${first[0]}`, p)
      }
    }
    return { predByName, predByNorm, predByLastFirst }
  }, [predictions])

  // Stable reference — only changes when lookup maps change (i.e. predictions load)
  const getPred = useCallback((fullName: string): PlayerPrediction | undefined => {
    const exact = fullName.toLowerCase()
    if (predByName.has(exact)) return predByName.get(exact)

    const normed = normalizeName(fullName)
    if (predByNorm.has(normed)) return predByNorm.get(normed)

    const parts = fullName.trim().split(/\s+/)
    if (parts.length >= 2) {
      const last  = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
      const first = parts[0].toLowerCase().replace(/\./g, '')
      const key   = `${last},${first[0]}`
      if (predByLastFirst.has(key)) return predByLastFirst.get(key)
    }

    return undefined
  }, [predByName, predByNorm, predByLastFirst])

  return { predictions, predByName, predByNorm, predByLastFirst, getPred, isLoading, error }
}
