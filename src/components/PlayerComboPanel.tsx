'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { DraftEntry, PlayerExposure } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'
import { computeExposures } from '@/lib/processData'

interface Props {
  entries: DraftEntry[]
  allExposures: PlayerExposure[]
  comboNames: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onClear: () => void
  getPred: (name: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
}

const POS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  QB: { bg: '#1a0f0f', text: '#f87171', border: '#7f1d1d' },
  RB: { bg: '#0f1a0f', text: '#4ade80', border: '#14532d' },
  WR: { bg: '#0f1020', text: '#60a5fa', border: '#1e3a5f' },
  TE: { bg: '#1a150a', text: '#fbbf24', border: '#78350f' },
}

const SPLIT_COLOR: Record<PredSplit, string> = { C: '#fcd34d', M: '#6ee7b7', F: '#7dd3fc' }

export default function PlayerComboPanel({
  entries, allExposures, comboNames, onAdd, onRemove, onClear, getPred, activeSplit,
}: Props) {
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)
  const dropdownRef         = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return allExposures
      .filter(e => !comboNames.includes(e.player.fullName) && e.player.fullName.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, allExposures, comboNames])

  // Entries that contain ALL combo players
  const comboEntries = useMemo(() => {
    if (comboNames.length === 0) return []
    return entries.filter(entry =>
      comboNames.every(name =>
        entry.picks.some(p => p.player.fullName.toLowerCase() === name.toLowerCase())
      )
    )
  }, [entries, comboNames])

  // Co-exposures computed from filtered entries, excluding the combo players themselves
  const coExposures = useMemo(() => {
    if (comboEntries.length === 0) return []
    const comboSet = new Set(comboNames.map(n => n.toLowerCase()))
    return computeExposures(comboEntries, comboEntries.length)
      .filter(e => !comboSet.has(e.player.fullName.toLowerCase()))
  }, [comboEntries, comboNames])

  const comboPct  = entries.length > 0 ? ((comboEntries.length / entries.length) * 100).toFixed(1) : '0'
  const splitHex  = SPLIT_COLOR[activeSplit]

  // Position lookup for selected player pill colours
  const posLookup = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of allExposures) m.set(e.player.fullName.toLowerCase(), e.player.position)
    return m
  }, [allExposures])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="section-header">Player Combo</h2>
        {comboNames.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{comboEntries.length}</span>
              <span style={{ color: '#475569' }}> / {entries.length} teams</span>
              <span style={{ color: '#7c3aed', fontWeight: 700, marginLeft: 4 }}>({comboPct}%)</span>
            </span>
            <button
              onClick={onClear}
              style={{ fontSize: 10, color: '#475569', background: 'var(--navy-700)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Search + selected pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', minHeight: 38 }}>
        {comboNames.map(name => {
          const pos = posLookup.get(name.toLowerCase()) ?? 'WR'
          const c   = POS_COLORS[pos]
          return (
            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: '2px 7px', fontSize: 11, color: c.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 9, opacity: 0.7 }}>{pos}</span>
              {name}
              <button onClick={() => onRemove(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text, opacity: 0.5, padding: 0, lineHeight: 1, fontSize: 12, marginLeft: 1 }}>×</button>
            </span>
          )
        })}

        {/* Search input */}
        <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={comboNames.length === 0 ? 'Search for a player…' : 'Add another player…'}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#e2e8f0', fontSize: 12, padding: '2px 0',
            }}
          />
          {open && suggestions.length > 0 && (
            <div ref={dropdownRef} style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 6,
              background: 'var(--navy-800)', border: '1px solid var(--border)', borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 220, overflow: 'hidden',
            }}>
              {suggestions.map(s => {
                const c = POS_COLORS[s.player.position]
                return (
                  <button
                    key={s.player.appearance}
                    onMouseDown={e => { e.preventDefault(); onAdd(s.player.fullName); setQuery('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-700)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 3, padding: '1px 4px', letterSpacing: '0.06em' }}>{s.player.position}</span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>{s.player.fullName}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>{s.player.nflTeam}</span>
                    <span style={{ fontSize: 10, color: '#7c3aed' }}>{s.exposurePct.toFixed(0)}%</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {comboNames.length > 0 && (
        coExposures.length === 0 ? (
          <div className="py-10 text-center text-xs uppercase tracking-widest" style={{ color: '#334155' }}>
            No teams contain this combination
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--navy-900)', borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '4px 12px', color: '#334155', fontSize: 10 }} />
                    <td colSpan={3} style={{ padding: '4px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: splitHex, opacity: 0.7 }}>
                      {activeSplit === 'C' ? 'CEILING' : activeSplit === 'M' ? 'MEDIAN' : 'FLOOR'} PROJECTION
                    </td>
                  </tr>
                  <tr style={{ background: 'var(--navy-800)', borderBottom: '1px solid var(--border)' }}>
                    {[
                      { label: 'PLAYER',    right: false },
                      { label: 'POS',       right: false },
                      { label: 'NFL',       right: false },
                      { label: 'CO-EXP %', right: true  },
                      { label: 'AVG PK',   right: true  },
                      { label: 'RATE',     right: true  },
                      { label: 'AVG',      right: true  },
                      { label: 'MAX',      right: true  },
                    ].map((h, i) => (
                      <th key={i} style={{
                        padding: '8px 12px', textAlign: h.right ? 'right' : 'left',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: '#475569',
                        whiteSpace: 'nowrap',
                        borderRight: i === 4 ? '1px solid var(--border)' : undefined,
                        borderLeft:  i === 5 ? '1px solid var(--border)' : undefined,
                      }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coExposures.map((exp, i) => {
                    const pred  = getPred(exp.player.fullName)
                    const sd    = pred?.[activeSplit]
                    const c     = POS_COLORS[exp.player.position]
                    const rowBg = i % 2 === 0 ? 'var(--navy-900)' : 'var(--navy-950)'
                    return (
                      <tr key={exp.player.appearance}
                        style={{ background: rowBg, borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-700)')}
                        onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                      >
                        <td style={{ padding: '7px 12px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                          {exp.player.fullName}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 3, fontSize: 9, fontWeight: 800, padding: '1px 5px', letterSpacing: '0.06em' }}>
                            {exp.player.position}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px', color: '#64748b' }}>{exp.player.nflTeam || '—'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <div style={{ width: 48, height: 4, background: 'var(--navy-700)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${exp.exposurePct}%`, background: '#8b5cf6', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: '#e2e8f0', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
                              {exp.exposurePct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid var(--border)' }}>
                          {exp.avgPickNumber.toFixed(1)}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', borderLeft: '1px solid var(--border)' }}>
                          {sd ? <span style={{ color: splitHex, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sd.predRate.toFixed(1)}</span> : <span style={{ color: '#1e293b' }}>—</span>}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: sd ? splitHex : '#1e293b', fontWeight: sd ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                          {sd ? sd.predAVG.toFixed(1) : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: sd ? splitHex : '#1e293b', fontVariantNumeric: 'tabular-nums', opacity: sd ? 0.85 : 1 }}>
                          {sd ? sd.predMax.toFixed(1) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
