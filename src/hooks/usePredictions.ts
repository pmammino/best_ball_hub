'use client'

import { useState, useEffect } from 'react'

export interface PlayerPrediction {
  NFLNewsID: number
  firstName: string
  lastName: string
  fullName: string
  position: string
  team: string
  gamesPlayed: number
  predRate: number
  predAVG: number
  predMax: number
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

  return { predictions, isLoading, error }
}
