'use client'

import { useState } from 'react'
import { PlayerExposure, SortField, SortDirection } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'

interface Props {
  exposures: PlayerExposure[]
  totalEntries: number
  getPred: (fullName: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300',
  RB: 'bg-green-900/50 text-green-300',
  WR: 'bg-blue-900/50 text-blue-300',
  TE: 'bg-yellow-900/50 text-yellow-300',
}

const SPLIT_LABEL: Record<PredSplit, string> = { C: 'Ceiling', M: 'Median', F: 'Floor' }
const SPLIT_COLOR: Record<PredSplit, string> = {
  C: 'text-amber-300',
  M: 'text-emerald-300',
  F: 'text-sky-300',
}

function sortExposures(exposures: PlayerExposure[], field: SortField, dir: SortDirection, getPred: Props['getPred'], split: PredSplit): PlayerExposure[] {
  return [...exposures].sort((a, b) => {
    let av: string | number, bv: string | number
    if (field === 'predRate' || field === 'predAVG' || field === 'predMax') {
      const ap = getPred(a.player.fullName)?.[split]
      const bp = getPred(b.player.fullName)?.[split]
      const key = field as 'predRate' | 'predAVG' | 'predMax'
      av = ap?.[key] ?? -1
      bv = bp?.[key] ?? -1
    } else {
      switch (field) {
        case 'name': av = a.player.fullName; bv = b.player.fullName; break
        case 'position': av = a.player.position; bv = b.player.position; break
        case 'nflTeam': av = a.player.nflTeam; bv = b.player.nflTeam; break
        case 'count': av = a.count; bv = b.count; break
        case 'exposurePct': av = a.exposurePct; bv = b.exposurePct; break
        case 'avgPickNumber': av = a.avgPickNumber; bv = b.avgPickNumber; break
        default: av = 0; bv = 0
      }
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

type ColKey = SortField | 'predRate' | 'predAVG' | 'predMax'

const BASE_COLS: Array<{ key: ColKey; label: string; align: 'left' | 'right' }> = [
  { key: 'name',         label: 'Player',     align: 'left' },
  { key: 'position',     label: 'Pos',        align: 'left' },
  { key: 'nflTeam',      label: 'Team',       align: 'left' },
  { key: 'count',        label: 'Teams',      align: 'right' },
  { key: 'exposurePct',  label: 'Exposure %', align: 'right' },
  { key: 'avgPickNumber',label: 'Avg Pick',   align: 'right' },
  { key: 'predRate',     label: 'Rate',       align: 'right' },
  { key: 'predAVG',      label: 'AVG',        align: 'right' },
  { key: 'predMax',      label: 'Max',        align: 'right' },
]

export default function ExposureTable({ exposures, totalEntries, getPred, activeSplit }: Props) {
  const [sortField, setSortField] = useState<ColKey>('exposurePct')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  function handleSort(field: ColKey) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'name' || field === 'position' || field === 'nflTeam' ? 'asc' : 'desc')
    }
  }

  const sorted = sortExposures(exposures, sortField as SortField, sortDir, getPred, activeSplit)

  if (exposures.length === 0) {
    return <div className="text-center py-12 text-gray-500">No players match the current filters.</div>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 border-b border-gray-800">
            {BASE_COLS.map((col) => {
              const isPred = col.key === 'predRate' || col.key === 'predAVG' || col.key === 'predMax'
              return (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${isPred ? SPLIT_COLOR[activeSplit] + ' opacity-80' : 'text-gray-400'}`}
                >
                  <span className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    {isPred && <span className="text-xs opacity-50">({activeSplit})</span>}
                    {sortField === col.key && (
                      <span className="text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
          {/* Split label sub-row for pred columns */}
          <tr className="bg-gray-900/60 border-b border-gray-800 text-xs text-gray-600">
            <td colSpan={6} className="px-4 py-1" />
            <td colSpan={3} className={`px-4 py-1 text-right ${SPLIT_COLOR[activeSplit]} opacity-60`}>
              {SPLIT_LABEL[activeSplit]} projections
            </td>
          </tr>
        </thead>
        <tbody>
          {sorted.map((exp, i) => {
            const pred = getPred(exp.player.fullName)
            const splitData = pred?.[activeSplit]
            return (
              <tr
                key={exp.player.appearance}
                className={`border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-900/20' : ''}`}
              >
                <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">{exp.player.fullName}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[exp.player.position] ?? 'bg-gray-700 text-gray-300'}`}>
                    {exp.player.position}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-300">{exp.player.nflTeam || '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{exp.count}/{totalEntries}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${exp.exposurePct}%` }} />
                    </div>
                    <span className="text-white font-medium w-10 text-right tabular-nums">
                      {exp.exposurePct.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{exp.avgPickNumber.toFixed(1)}</td>

                {/* Prediction columns */}
                <td className="px-4 py-2.5 text-right">
                  {splitData ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(splitData.predRate / 20) * 100}%` }} />
                      </div>
                      <span className={`tabular-nums font-medium w-8 text-right ${SPLIT_COLOR[activeSplit]}`}>
                        {splitData.predRate.toFixed(1)}
                      </span>
                    </div>
                  ) : <span className="text-gray-700">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${splitData ? SPLIT_COLOR[activeSplit] : 'text-gray-700'}`}>
                  {splitData ? splitData.predAVG.toFixed(1) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${splitData ? SPLIT_COLOR[activeSplit] : 'text-gray-700'}`}>
                  {splitData ? splitData.predMax.toFixed(1) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
