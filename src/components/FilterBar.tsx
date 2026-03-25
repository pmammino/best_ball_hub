'use client'

import { Filters, Position } from '@/lib/types'

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE']

interface Props {
  filters: Filters
  tournaments: string[]
  nflTeams: string[]
  onChange: (filters: Filters) => void
}

export default function FilterBar({ filters, tournaments, nflTeams, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Position toggles */}
      <div className="flex items-center gap-1">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => onChange({ ...filters, position: pos })}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              filters.position === pos
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Tournament dropdown */}
      {tournaments.length > 1 && (
        <select
          value={filters.tournament}
          onChange={(e) => onChange({ ...filters, tournament: e.target.value })}
          className="bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="ALL">All Tournaments</option>
          {tournaments.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      {/* NFL Team dropdown */}
      {nflTeams.length > 0 && (
        <select
          value={filters.nflTeam}
          onChange={(e) => onChange({ ...filters, nflTeam: e.target.value })}
          className="bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="ALL">All NFL Teams</option>
          {nflTeams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
    </div>
  )
}
