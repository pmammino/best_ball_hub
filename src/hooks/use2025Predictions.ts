'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PlayerPrediction } from './usePredictions'
import { parseLegacyProjections } from '@/lib/parseProjections'

function stripSuffix(name: string): string {
  return name.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, '').trim()
}
function stripSpecialChars(name: string): string {
  return name.replace(/[.']/g, '').replace(/\s+/g, ' ').trim()
}
function normalizeName(name: string): string {
  return stripSuffix(stripSpecialChars(name)).toLowerCase()
}

export function use2025Predictions(pred26: PlayerPrediction[]) {
  const [predByName, setPredByName] = useState<Map<string, PlayerPrediction>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (pred26.length === 0) return
    setIsLoading(true)

    const pred26ByNFLId = new Map<string, PlayerPrediction>()
    for (const p of pred26) {
      pred26ByNFLId.set(String(p.NFLNewsID), p)
    }

    fetch('/projections-2025.csv')
      .then((r) => r.text())
      .then((text) => {
        setPredByName(parseLegacyProjections(text, pred26ByNFLId))
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load 2025 projections')
        setIsLoading(false)
      })
  }, [pred26])

  const { predByNorm, predByLastFirst } = useMemo(() => {
    const predByNorm = new Map<string, PlayerPrediction>()
    const predByLastFirst = new Map<string, PlayerPrediction>()

    for (const [, pred] of Array.from<[string, PlayerPrediction]>(predByName as Map<string, PlayerPrediction>)) {
      predByNorm.set(normalizeName(pred.fullName), pred)
      const parts = pred.fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
        const first = parts[0].toLowerCase().replace(/\./g, '')
        predByLastFirst.set(`${last},${first[0]}`, pred)
      }
    }
    return { predByNorm, predByLastFirst }
  }, [predByName])

  const getPred = useCallback(
    (fullName: string): PlayerPrediction | undefined => {
      const exact = fullName.toLowerCase()
      if (predByName.has(exact)) return predByName.get(exact)

      const normed = normalizeName(fullName)
      if (predByNorm.has(normed)) return predByNorm.get(normed)

      const parts = fullName.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last = parts[parts.length - 1].toLowerCase().replace(/\./g, '')
        const first = parts[0].toLowerCase().replace(/\./g, '')
        const key = `${last},${first[0]}`
        if (predByLastFirst.has(key)) return predByLastFirst.get(key)
      }
      return undefined
    },
    [predByName, predByNorm, predByLastFirst],
  )

  return { getPred, isLoading, error }
}
