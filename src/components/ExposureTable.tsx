'use client'

import { useState } from 'react'
import { PlayerExposure, SortField, SortDirection } from '@/lib/types'

interface Props {
  exposures: PlayerExposure[]
  totalEntries: number
}

type Column = { key: SortField; label: string; align: 'left' | 'right' }

const COLUMNS: Column[] = [
  { key: 'name', label: 'Player', align: 'left' },
  { key: 'position', label: 'Pos', align: 'left' },
  { key: 'nflTeam', label: 'Team', align: 'left' },
  { key: 'count', label: 'Teams', align: 'right' },
  { key: 'exposurePct', label: 'Exposure %', align: 'right' },
  { key: 'avgPickNumber', label: 'Avg Pick', align: 'right' },
]

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300',
  RB: 'bg-green-900/50 text-green-300',
  WR: 'bg-blue-900/50 text-blue-300',
  TE: 'bg-yellow-900/50 text-yellow-300',
}

function sortExposures(
  exposures: PlayerExposure[],
  field: SortField,
  dir: SortDirection
): PlayerExposure[] {
  const sorted = [...exposures].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (field) {
      case 'name': av = a.player.fullName; bv = b.player.fullName; break
      case 'position': av = a.player.position; bv = b.player.position; break
      case 'nflTeam': av = a.player.nflTeam; bv = b.player.nflTeam; break
      case 'count': av = a.count; bv = b.count; break
      case 'exposurePct': av = a.exposurePct; bv = b.exposurePct; break
      case 'avgPickNumber': av = a.avgPickNumber; bv = b.avgPickNumber; break
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
  return sorted
}

export default function ExposureTable({ exposures, totalEntries }: Props) {
  const [sortField, setSortField] = useState<SortField>('exposurePct')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'name' || field === 'position' || field === 'nflTeam' ? 'asc' : 'desc')
    }
  }

  const sorted = sortExposures(exposures, sortField, sortDir)

  if (exposures.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No players match the current filters.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-3 font-medium text-gray-400 cursor-pointer select-none hover:text-white transition-colors ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                <span className="flex items-center gap-1 whitespace-nowrap" style={col.align === 'right' ? { justifyContent: 'flex-end' } : {}}>
                  {col.label}
                  {sortField === col.key && (
                    <span className="text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((exp, i) => (
            <tr
              key={exp.player.appearance}
              className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${
                i % 2 === 0 ? 'bg-gray-900/20' : ''
              }`}
            >
              <td className="px-4 py-3 font-medium text-white">{exp.player.fullName}</td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[exp.player.position] ?? 'bg-gray-700 text-gray-300'}`}>
                  {exp.player.position}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300">{exp.player.nflTeam || '—'}</td>
              <td className="px-4 py-3 text-right text-gray-300">{exp.count}/{totalEntries}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${exp.exposurePct}%` }}
                    />
                  </div>
                  <span className="text-white font-medium w-12 text-right">
                    {exp.exposurePct.toFixed(0)}%
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-gray-300">
                {exp.avgPickNumber.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
