'use client'

import { useState, useEffect } from 'react'
import Papa from 'papaparse'

/**
 * Loads public/players.csv — the canonical id bridge maintained by
 * tools/build_players_csv.py. It maps the Underdog player id to the RotoWire
 * projection id (nfl_news_id), which is what lets the app resolve a drafted
 * player to a projection by id instead of by name.
 *
 * Row shape: nfl_news_id, first_name, last_name, position, team, underdog_id
 */
interface PlayerRow {
  nfl_news_id: string
  underdog_id: string
  [key: string]: string
}

export function usePlayerMap(url = '/players.csv') {
  // underdog_id -> nfl_news_id
  const [underdogToNflId, setUnderdogToNflId] = useState<Map<string, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`players.csv returned ${r.status}`)
        return r.text()
      })
      .then(text => {
        const parsed = Papa.parse<PlayerRow>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: h => h.trim(),
        })
        const map = new Map<string, string>()
        for (const row of parsed.data) {
          const uid = row.underdog_id?.trim()
          const nfl = row.nfl_news_id?.trim()
          if (uid && nfl) map.set(uid, nfl)
        }
        setUnderdogToNflId(map)
        setIsLoading(false)
      })
      .catch(err => {
        // Non-fatal — without the map, projection lookup falls back to names.
        setError(err?.message ?? 'Failed to load players.csv')
        setIsLoading(false)
      })
  }, [url])

  return { underdogToNflId, isLoading, error }
}
