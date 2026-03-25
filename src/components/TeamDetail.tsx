'use client'

import { DraftEntry, Pick, Position } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'
import { getAVRate, gradeRate, pickToRound } from '@/lib/roundBenchmarks'

interface Props {
  entry: DraftEntry
  getPred: (fullName: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300 border-red-800',
  RB: 'bg-green-900/50 text-green-300 border-green-800',
  WR: 'bg-blue-900/50 text-blue-300 border-blue-800',
  TE: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
}

const STACK_COLORS = [
  'bg-purple-900/60 border-purple-700',
  'bg-teal-900/60 border-teal-700',
  'bg-orange-900/60 border-orange-700',
  'bg-pink-900/60 border-pink-700',
  'bg-cyan-900/60 border-cyan-700',
  'bg-lime-900/60 border-lime-700',
]

const SPLIT_COLOR: Record<PredSplit, string> = {
  C: 'text-amber-300',
  M: 'text-emerald-300',
  F: 'text-sky-300',
}

function teamColor(team: string, allTeams: string[]): string {
  return STACK_COLORS[allTeams.indexOf(team) % STACK_COLORS.length]
}

export default function TeamDetail({ entry, getPred, activeSplit }: Props) {
  // Build stacks
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

  // Positional counts + summed Rate per position
  const posSummary: Record<Position, { count: number; totalRate: number }> = {
    QB: { count: 0, totalRate: 0 },
    RB: { count: 0, totalRate: 0 },
    WR: { count: 0, totalRate: 0 },
    TE: { count: 0, totalRate: 0 },
  }
  for (const pick of entry.picks) {
    const pos = pick.player.position
    posSummary[pos].count += 1
    const splitData = getPred(pick.player.fullName)?.[activeSplit]
    if (splitData) posSummary[pos].totalRate += splitData.predRate
  }

  const splitColor = SPLIT_COLOR[activeSplit]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white">{entry.label}</h3>
        <p className="text-sm text-gray-400">{entry.picks.length} picks</p>
      </div>

      {/* Positional summary with Rate totals */}
      <div className="grid grid-cols-4 gap-2">
        {(['QB', 'RB', 'WR', 'TE'] as Position[]).map((pos) => {
          const { count, totalRate } = posSummary[pos]
          return (
            <div key={pos} className={`rounded-lg border px-2 py-2 text-center ${POSITION_COLORS[pos]}`}>
              <div className="text-lg font-bold">{count}</div>
              <div className="text-xs font-medium">{pos}</div>
              {totalRate > 0 && (
                <div className={`text-xs font-semibold mt-0.5 ${splitColor}`} title={`Total Rate (${activeSplit})`}>
                  {totalRate.toFixed(1)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-600 -mt-1">Colored number = sum of Rate ({activeSplit}) for that position</p>

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
                  {picks.map((pick) => {
                    const pred = getPred(pick.player.fullName)?.[activeSplit]
                    return (
                      <div key={pick.player.appearance} className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${POSITION_COLORS[pick.player.position]}`}>
                          {pick.player.position}
                        </span>
                        <span className="text-sm text-white">{pick.player.fullName}</span>
                        <span className="text-xs text-gray-400">#{pick.pickNumber}</span>
                        {pred && (
                          <span className={`text-xs font-medium ${splitColor}`}>
                            {pred.predAVG.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )
                  })}
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
                <th className="px-3 py-2 text-left text-gray-400 font-medium w-8">#</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Player</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">Pos</th>
                <th className="px-3 py-2 text-left text-gray-400 font-medium">NFL</th>
                <th className="px-3 py-2 text-center text-gray-500 font-medium">Rd</th>
                <th className={`px-3 py-2 text-right font-medium ${splitColor} opacity-80`}>Rate</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Avg</th>
                <th className="px-3 py-2 text-center text-gray-400 font-medium">Grade</th>
                <th className={`px-3 py-2 text-right font-medium ${splitColor} opacity-80`}>AVG</th>
                <th className={`px-3 py-2 text-right font-medium ${splitColor} opacity-80`}>Max</th>
              </tr>
            </thead>
            <tbody>
              {entry.picks.map((pick, i) => {
                const isStacked = stackedTeams.includes(pick.player.nflTeam)
                const pred = getPred(pick.player.fullName)?.[activeSplit]
                const round = pickToRound(pick.pickNumber)
                const avRate = getAVRate(pick.player.position, pick.pickNumber)
                const grading = pred && avRate !== null
                  ? gradeRate(pred.predRate, avRate)
                  : null

                return (
                  <tr
                    key={pick.player.appearance + pick.pickNumber}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${isStacked ? 'bg-gray-800/40' : i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
                  >
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{pick.pickNumber}</td>
                    <td className="px-3 py-2 text-white font-medium whitespace-nowrap">
                      {pick.player.fullName}
                      {isStacked && <span className="ml-1.5 text-xs text-indigo-400">stack</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[pick.player.position]}`}>
                        {pick.player.position}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300">{pick.player.nflTeam || '—'}</td>
                    <td className="px-3 py-2 text-center text-gray-600 tabular-nums text-xs">{round}</td>

                    {/* predRate vs benchmark */}
                    <td className={`px-3 py-2 text-right tabular-nums ${pred ? splitColor : 'text-gray-700'}`}>
                      {pred ? pred.predRate.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500 text-xs">
                      {avRate !== null ? avRate.toFixed(2) : '—'}
                    </td>

                    {/* Grade */}
                    <td className="px-3 py-2 text-center">
                      {grading ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${grading.color}`}>
                          {grading.grade}
                          <span className="font-normal opacity-70">
                            ({grading.delta >= 0 ? '+' : ''}{grading.delta.toFixed(1)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </td>

                    {/* AVG & Max */}
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${pred ? splitColor : 'text-gray-700'}`}>
                      {pred ? pred.predAVG.toFixed(1) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pred ? splitColor : 'text-gray-700'}`}>
                      {pred ? pred.predMax.toFixed(1) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Grade legend */}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
          <span className="text-gray-500 font-medium">Grade vs round avg:</span>
          <span className="text-emerald-300">A+ ≥+50%</span>
          <span className="text-green-400">A ≥+20%</span>
          <span className="text-lime-400">B ≥−10%</span>
          <span className="text-yellow-400">C ≥−30%</span>
          <span className="text-orange-400">D ≥−50%</span>
          <span className="text-red-400">F &lt;−50%</span>
          <span className="ml-2">· Avg = position avg Rate for that round</span>
        </div>
      </div>
    </div>
  )
}
