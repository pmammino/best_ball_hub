'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { parseFeedProjections } from '@/lib/parseProjections'
import { loadXGBModels, type XGBModel } from '@/lib/xgbRate'

// Projections come from the RotoWire ceiling/floor feed. By default we hit the
// same-origin path rewritten to the upstream proxy in next.config.mjs, which
// avoids browser CORS. Override with NEXT_PUBLIC_PROJECTIONS_FEED_URL to point
// directly at a CORS-enabled proxy instead.
const PROJECTIONS_FEED_URL =
  process.env.NEXT_PUBLIC_PROJECTIONS_FEED_URL ?? '/api/projections-feed'

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
  const [predByName, setPredByName] = useState<Map<string, PlayerPrediction>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(PROJECTIONS_FEED_URL).then(r => {
        if (!r.ok) throw new Error(`Projections feed returned ${r.status}`)
        return r.text()
      }),
      loadXGBModels().catch(() => null as Map<string, XGBModel> | null),
    ])
      .then(([text, models]) => {
        setPredByName(parseFeedProjections(text, models ?? undefined))
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load projections')
        setIsLoading(false)
      })
  }, [])

  const predictions = useMemo(
    () => Array.from<[string, PlayerPrediction]>(predByName as Map<string, PlayerPrediction>).map(([, p]) => p),
    [predByName],
  )

  // Keyed by nfl_news_id (== feed <Player Id>) for id-based lookup.
  const predById = useMemo(() => {
    const m = new Map<string, PlayerPrediction>()
    for (const p of predictions) m.set(String(p.NFLNewsID), p)
    return m
  }, [predictions])

  const { predByNorm, predByLastFirst } = useMemo(() => {
    const predByNorm      = new Map<string, PlayerPrediction>()
    const predByLastFirst = new Map<string, PlayerPrediction>()

    for (const [, p] of Array.from<[string, PlayerPrediction]>(predByName as Map<string, PlayerPrediction>)) {
      predByNorm.set(normalizeName(p.fullName), p)

      const parts = p.fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last  = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
        const first = parts[0].toLowerCase().replace(/\./g, '')
        predByLastFirst.set(`${last},${first[0]}`, p)
      }
    }
    return { predByNorm, predByLastFirst }
  }, [predByName])

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

  return { predictions, predById, predByName, predByNorm, predByLastFirst, getPred, isLoading, error }
}
