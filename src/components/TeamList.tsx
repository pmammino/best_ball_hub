'use client'

import { useEffect, useRef, useState } from 'react'
import { DraftEntry } from '@/lib/types'
import { TeamScore } from '@/hooks/useTeamScores'
import { TIER_STYLE } from '@/lib/scoreTeam'

interface Props {
  entries: DraftEntry[]
  selectedEntryId: string | null
  onSelect: (id: string) => void
  teamScores: Map<string, TeamScore>
}

/**
 * Compact team picker. Renders as a single dropdown trigger so a large number
 * of entries no longer stretches the page; the full list (with tier grade and
 * tournament) lives in a scrollable panel that opens on click.
 */
export default function TeamList({ entries, selectedEntryId, onSelect, teamScores }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedIdx = entries.findIndex(e => e.entryId === selectedEntryId)
  const selected = selectedIdx >= 0 ? entries[selectedIdx] : null
  const selectedScore = selected ? teamScores.get(selected.entryId) : undefined
  const selectedTc = selectedScore ? TIER_STYLE[selectedScore.tier] : null

  function tierBadge(tier: string, tc: { text: string; bg: string }) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 800, color: tc.text, background: tc.bg,
        border: `1px solid ${tc.text}40`, borderRadius: 3,
        padding: '1px 5px', letterSpacing: '0.04em',
      }}>
        {tier}
      </span>
    )
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', textAlign: 'left',
          padding: '7px 12px', borderRadius: 6,
          border: '1px solid var(--border-light)',
          background: 'var(--navy-800)',
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
      >
        {selected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
              Entry {selectedIdx + 1}
            </span>
            {selectedTc && selectedScore && tierBadge(selectedScore.tier, selectedTc)}
            <span style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.tournament}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Select a team… <span style={{ color: '#475569' }}>({entries.length})</span>
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            maxHeight: 360, overflowY: 'auto',
            padding: 4, borderRadius: 6,
            border: '1px solid var(--border-light)',
            background: 'var(--navy-900)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          }}
        >
          {entries.map((entry, i) => {
            const active = entry.entryId === selectedEntryId
            const score  = teamScores.get(entry.entryId)
            const tc     = score ? TIER_STYLE[score.tier] : null
            return (
              <button key={entry.entryId}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { onSelect(entry.entryId); setOpen(false) }}
                style={{
                  textAlign: 'left', width: '100%',
                  padding: '7px 10px', borderRadius: 4,
                  border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  background: active ? 'var(--navy-700)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--navy-800)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#e2e8f0' : '#94a3b8' }}>
                    Entry {i + 1}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {tc && score && tierBadge(score.tier, tc)}
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
      )}
    </div>
  )
}
