'use client'

import { Filters, Position } from '@/lib/types'

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE']

const POS_ACTIVE: Record<string, string> = {
  QB: 'bg-red-900/50 text-red-300 border-red-700/60',
  RB: 'bg-green-900/50 text-green-300 border-green-700/60',
  WR: 'bg-blue-900/50 text-blue-300 border-blue-700/60',
  TE: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/60',
  ALL: 'text-blue-300 border-blue-700/60',
}

interface Props {
  filters: Filters
  tournaments: string[]
  nflTeams: string[]
  onChange: (f: Filters) => void
}

const selectStyle: React.CSSProperties = {
  background: 'var(--navy-800)',
  border: '1px solid var(--border-light)',
  borderRadius: 4,
  color: '#94a3b8',
  fontSize: 11,
  padding: '4px 10px',
  outline: 'none',
  cursor: 'pointer',
}

export default function FilterBar({ filters, tournaments, nflTeams, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Position pills */}
      <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-light)' }}>
        {POSITIONS.map(pos => {
          const active = filters.position === pos
          return (
            <button key={pos}
              onClick={() => onChange({ ...filters, position: pos })}
              className={`px-3 py-1 text-[11px] font-bold tracking-widest border-l first:border-l-0 transition-all ${active ? (POS_ACTIVE[pos] ?? 'bg-blue-900/40 text-blue-300 border-blue-700/60') : 'text-slate-500 hover:text-slate-300'}`}
              style={{ borderColor: 'var(--border-light)', background: active ? undefined : 'var(--navy-800)' }}
            >
              {pos}
            </button>
          )
        })}
      </div>

      {/* Tournament */}
      {tournaments.length > 1 && (
        <select value={filters.tournament}
          onChange={e => onChange({ ...filters, tournament: e.target.value })}
          style={selectStyle}
        >
          <option value="ALL">All Tournaments</option>
          {tournaments.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      )}

      {/* NFL Team */}
      {nflTeams.length > 0 && (
        <select value={filters.nflTeam}
          onChange={e => onChange({ ...filters, nflTeam: e.target.value })}
          style={selectStyle}
        >
          <option value="ALL">All NFL Teams</option>
          {nflTeams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
    </div>
  )
}
