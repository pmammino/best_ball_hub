'use client'

import { useState, useEffect, useCallback } from 'react'

interface GameMatchup {
  home: string
  away: string
}

interface SeasonSchedule {
  byeWeeks: Record<string, number>
  playoffs: {
    '15': GameMatchup[]
    '16': GameMatchup[]
    '17': GameMatchup[]
  }
}

export type PlayoffWeek = 15 | 16 | 17

export interface PlayoffGameInfo {
  opponent: string
  gameKey: string  // canonical: "W:TEAM1:TEAM2" where TEAM1 < TEAM2
  isHome: boolean
}

export function useSchedule() {
  const [sched, setSched] = useState<SeasonSchedule | null>(null)

  useEffect(() => {
    fetch('/schedule.json')
      .then(r => r.json())
      .then((d: { '2026': SeasonSchedule }) => setSched(d['2026']))
      .catch(() => {/* non-fatal */})
  }, [])

  const getByeWeek = useCallback((nflTeam: string): number | null =>
    sched?.byeWeeks[nflTeam] ?? null,
  [sched])

  // Returns Map<nflTeam, gameKey> for all games in a given playoff week
  const buildGameMap = useCallback((week: PlayoffWeek): Map<string, string> => {
    const games = sched?.playoffs[String(week) as '15' | '16' | '17'] ?? []
    const map = new Map<string, string>()
    for (const g of games) {
      const key = `${week}:${[g.home, g.away].sort().join(':')}`
      map.set(g.home, key)
      map.set(g.away, key)
    }
    return map
  }, [sched])

  // Returns info about each playoff week for a given team
  const getPlayoffInfo = useCallback((nflTeam: string): Partial<Record<PlayoffWeek, PlayoffGameInfo>> => {
    const result: Partial<Record<PlayoffWeek, PlayoffGameInfo>> = {}
    for (const week of [15, 16, 17] as PlayoffWeek[]) {
      const games = sched?.playoffs[String(week) as '15' | '16' | '17'] ?? []
      for (const g of games) {
        if (g.home === nflTeam || g.away === nflTeam) {
          const isHome = g.home === nflTeam
          const opponent = isHome ? g.away : g.home
          const key = `${week}:${[g.home, g.away].sort().join(':')}`
          result[week] = { opponent, gameKey: key, isHome }
          break
        }
      }
    }
    return result
  }, [sched])

  return { loaded: !!sched, getByeWeek, buildGameMap, getPlayoffInfo }
}
