'use client'

import { DraftEntry } from '@/lib/types'
import { TeamScore } from '@/hooks/useTeamScores'
import { TIER_STYLE } from '@/lib/scoreTeam'

interface Props {
  entries: DraftEntry[]
  selectedEntryId: string | null
  onSelect: (id: string) => void
  teamScores: Map<string, TeamScore>
}

export default function TeamList({ entries, selectedEntryId, onSelect, teamScores }: Props) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry, i) => {
        const active = entry.entryId === selectedEntryId
        const score  = teamScores.get(entry.entryId)
        const tc     = score ? TIER_STYLE[score.tier] : null
        return (
          <button key={entry.entryId}
            onClick={() => onSelect(active ? '' : entry.entryId)}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 4,
              border: `1px solid ${active ? '#334155' : 'transparent'}`,
              background: active ? 'var(--navy-700)' : 'transparent',
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--navy-800)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#e2e8f0' : '#64748b' }}>
                Entry {i + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {tc && score && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: tc.text, background: tc.bg,
                    border: `1px solid ${tc.text}40`, borderRadius: 3,
                    padding: '1px 5px', letterSpacing: '0.04em',
                  }}>
                    {score.tier}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#334155', fontWeight: 600, letterSpacing: '0.04em' }}>
                  {entry.picks.length}P
                </span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginTop: 1, letterSpacing: '0.03em' }}>
              {entry.tournament}
            </div>
          </button>
        )
      })}
    </div>
  )
}
