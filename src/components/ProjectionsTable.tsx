'use client'

import { useState } from 'react'
import { PlayerPrediction } from '@/hooks/usePredictions'

type SortField = 'name' | 'position' | 'team' | 'games' | 'predRate' | 'predAVG' | 'predMax'
type SortDir = 'asc' | 'desc'

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300',
  RB: 'bg-green-900/50 text-green-300',
  WR: 'bg-blue-900/50 text-blue-300',
  TE: 'bg-yellow-900/50 text-yellow-300',
  FB: 'bg-green-900/30 text-green-400',
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE']

interface Props {
  predictions: PlayerPrediction[]
}

function sortRows(rows: PlayerPrediction[], field: SortField, dir: SortDir): PlayerPrediction[] {
  return [...rows].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (field) {
      case 'name':     av = a.fullName;    bv = b.fullName;    break
      case 'position': av = a.position;    bv = b.position;    break
      case 'team':     av = a.team;        bv = b.team;        break
      case 'games':    av = a.gamesPlayed; bv = b.gamesPlayed; break
      case 'predRate': av = a.predRate;    bv = b.predRate;    break
      case 'predAVG':  av = a.predAVG;     bv = b.predAVG;     break
      case 'predMax':  av = a.predMax;     bv = b.predMax;     break
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export default function ProjectionsTable({ predictions }: Props) {
  const [sortField, setSortField] = useState<SortField>('predAVG')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [posFilter, setPosFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'name' || field === 'position' || field === 'team' ? 'asc' : 'desc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-700">↕</span>
    return <span className="text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const filtered = predictions.filter((p) => {
    if (posFilter !== 'ALL' && p.position !== posFilter) return false
    if (search && !p.fullName.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const sorted = sortRows(filtered, sortField, sortDir)

  // Scale for Rate bar (max 20)
  const maxRate = 20

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                posFilter === pos
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search player…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
        />
        <span className="text-xs text-gray-500 ml-auto">{sorted.length} players</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400 bg-gray-900/40 rounded-lg px-4 py-2.5 border border-gray-800">
        <span><span className="font-semibold text-white">Rate</span> — season ownership rate (0–20)</span>
        <span><span className="font-semibold text-white">AVG</span> — predicted avg fantasy pts/game</span>
        <span><span className="font-semibold text-white">Max</span> — predicted ceiling game score</span>
        <span className="ml-auto text-gray-500 italic">Models trained on 2011–2025 historical data</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800">
              {[
                { key: 'name' as SortField,     label: 'Player',   align: 'left' },
                { key: 'position' as SortField, label: 'Pos',      align: 'left' },
                { key: 'team' as SortField,     label: 'Team',     align: 'left' },
                { key: 'games' as SortField,    label: 'Games',    align: 'right' },
                { key: 'predRate' as SortField, label: 'Rate',     align: 'right' },
                { key: 'predAVG' as SortField,  label: 'AVG',      align: 'right' },
                { key: 'predMax' as SortField,  label: 'Max',      align: 'right' },
              ].map(({ key, label, align }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-4 py-3 font-medium text-gray-400 cursor-pointer select-none hover:text-white transition-colors ${
                    align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <span className={`flex items-center gap-1 whitespace-nowrap ${align === 'right' ? 'justify-end' : ''}`}>
                    {label} <SortIcon field={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.NFLNewsID}
                className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${
                  i % 2 === 0 ? 'bg-gray-900/20' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-white">{p.fullName}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[p.position] ?? 'bg-gray-700 text-gray-300'}`}>
                    {p.position}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-300">{p.team || '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{p.gamesPlayed.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${(p.predRate / maxRate) * 100}%` }}
                      />
                    </div>
                    <span className="text-violet-300 font-medium tabular-nums w-8 text-right">{p.predRate.toFixed(1)}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-emerald-300 font-medium tabular-nums">{p.predAVG.toFixed(1)}</td>
                <td className="px-4 py-2.5 text-right text-amber-300 font-medium tabular-nums">{p.predMax.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
