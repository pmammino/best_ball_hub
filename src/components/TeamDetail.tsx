'use client'

import { DraftEntry, Pick, Position } from '@/lib/types'

interface Props {
  entry: DraftEntry
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300 border-red-800',
  RB: 'bg-green-900/50 text-green-300 border-green-800',
  WR: 'bg-blue-900/50 text-blue-300 border-blue-800',
  TE: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
}

// Deterministic color per NFL team abbreviation
const STACK_COLORS = [
  'bg-purple-900/60 border-purple-700',
  'bg-teal-900/60 border-teal-700',
  'bg-orange-900/60 border-orange-700',
  'bg-pink-900/60 border-pink-700',
  'bg-cyan-900/60 border-cyan-700',
  'bg-lime-900/60 border-lime-700',
]

function teamColor(team: string, allTeams: string[]): string {
  const idx = allTeams.indexOf(team)
  return STACK_COLORS[idx % STACK_COLORS.length]
}

function positionalCounts(picks: Pick[]): Record<Position, number> {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
  for (const pick of picks) {
    counts[pick.player.position] = (counts[pick.player.position] ?? 0) + 1
  }
  return counts
}

export default function TeamDetail({ entry }: Props) {
  // Build stacks: group by NFL team, filter >=2, skip blank
  const stackMap = new Map<string, Pick[]>()
  for (const pick of entry.picks) {
    const t = pick.player.nflTeam
    if (!t) continue
    if (!stackMap.has(t)) stackMap.set(t, [])
    stackMap.get(t)!.push(pick)
  }
  const stacks = Array.from(stackMap.entries())
    .filter(([, picks]) => picks.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length)
  const stackedTeams = stacks.map(([team]) => team)

  const counts = positionalCounts(entry.picks)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white">{entry.label}</h3>
        <p className="text-sm text-gray-400">{entry.picks.length} picks</p>
      </div>

      {/* Positional summary */}
      <div className="grid grid-cols-4 gap-2">
        {(['QB', 'RB', 'WR', 'TE'] as Position[]).map((pos) => (
          <div key={pos} className={`rounded-lg border px-3 py-2 text-center ${POSITION_COLORS[pos]}`}>
            <div className="text-lg font-bold">{counts[pos]}</div>
            <div className="text-xs font-medium">{pos}</div>
          </div>
        ))}
      </div>

      {/* Stacks */}
      {stacks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Team Stacks</h4>
          <div className="space-y-2">
            {stacks.map(([team, picks]) => (
              <div key={team} className={`rounded-lg border p-3 ${teamColor(team, stackedTeams)}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">{team}</span>
                  <span className="text-xs text-gray-300">{picks.length}-stack</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {picks.map((pick) => (
                    <div key={pick.player.appearance} className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${POSITION_COLORS[pick.player.position]}`}>
                        {pick.player.position}
                      </span>
                      <span className="text-sm text-white">{pick.player.fullName}</span>
                      <span className="text-xs text-gray-400">#{pick.pickNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full roster */}
      <div>
        <h4 className="text-sm font-semibold text-gray-300 mb-2">Full Roster</h4>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Player</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Pos</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">NFL Team</th>
              </tr>
            </thead>
            <tbody>
              {entry.picks.map((pick, i) => {
                const isStacked = stackedTeams.includes(pick.player.nflTeam)
                return (
                  <tr
                    key={pick.player.appearance + pick.pickNumber}
                    className={`border-b border-gray-800/50 ${isStacked ? 'bg-gray-800/40' : i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                  >
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{pick.pickNumber}</td>
                    <td className="px-3 py-2 text-white font-medium">
                      {pick.player.fullName}
                      {isStacked && (
                        <span className="ml-2 text-xs text-indigo-400">stack</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[pick.player.position]}`}>
                        {pick.player.position}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{pick.player.nflTeam || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
