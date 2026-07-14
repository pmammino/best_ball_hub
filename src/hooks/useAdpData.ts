'use client'

import { useState, useEffect } from 'react'

// Underdog appearances endpoint for the current slate. The slate/contest-style
// ids are season-specific — refresh them (or override here) each offseason.
const ADP_URL =
  process.env.NEXT_PUBLIC_UNDERDOG_APPEARANCES_URL ??
  'https://stats.underdogfantasy.com/v1/slates/a9c04e81-1ace-4b16-a31d-4c725a47f16f/contest_styles/9e62863e-1b29-53e8-8aca-2aae06aaac5f/appearances'

export interface AdpEntry {
  adp: number
  positionRank: string
}

interface RawAppearance {
  id: string
  type: string
  player_id?: string
  projection?: {
    adp?: string
    position_rank?: string
  }
}

interface ApiResponse {
  appearances: RawAppearance[]
}

export function useAdpData() {
  const [adpMap, setAdpMap] = useState<Map<string, AdpEntry>>(new Map())
  // appearance id -> Underdog player id (== players.csv underdog_id). This is
  // the hop that lets the app resolve a drafted appearance to a projection by id.
  const [appearanceToUnderdogId, setAppearanceToUnderdogId] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(ADP_URL)
      .then(r => r.json())
      .then((data: ApiResponse) => {
        const map = new Map<string, AdpEntry>()
        const idMap = new Map<string, string>()
        for (const app of data.appearances ?? []) {
          if (app.type !== 'Player' || !app.id) continue
          if (app.player_id) idMap.set(app.id, app.player_id)
          const adp = parseFloat(app.projection?.adp ?? '')
          if (isNaN(adp)) continue
          map.set(app.id, {
            adp,
            positionRank: app.projection?.position_rank ?? '',
          })
        }
        setAdpMap(map)
        setAppearanceToUnderdogId(idMap)
        setIsLoading(false)
      })
      .catch(err => {
        // Non-fatal — ADP enrichment is best-effort
        setError(err?.message ?? 'Failed to load ADP data')
        setIsLoading(false)
      })
  }, [])

  return { adpMap, appearanceToUnderdogId, isLoading, error }
}
