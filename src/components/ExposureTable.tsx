'use client'

import { useState } from 'react'
import { PlayerExposure, SortField, SortDirection } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'

interface Props {
  exposures: PlayerExposure[]
  totalEntries: number
  getPred: (fullName: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
  comboNames?: string[]
  onAddToCombo?: (name: string) => void
}

const POS_BADGE: Record<string, string> = {
  QB: 'bg-red-900/60 text-red-300 border border-red-800/60',
  RB: 'bg-green-900/60 text-green-300 border border-green-800/60',
  WR: 'bg-blue-900/60 text-blue-300 border border-blue-800/60',
  TE: 'bg-yellow-900/60 text-yellow-300 border border-yellow-800/60',
}

const SPLIT_COLOR: Record<PredSplit, string> = { C: '#fcd34d', M: '#6ee7b7', F: '#7dd3fc' }

type ColKey = SortField | 'predRate' | 'predAVG' | 'predMax'

type Col = { key: ColKey; label: string; right?: boolean; pred?: boolean }

const COLS: Col[] = [
  { key: 'name',          label: 'PLAYER'  },
  { key: 'position',      label: 'POS'     },
  { key: 'nflTeam',       label: 'NFL'     },
  { key: 'count',         label: 'TEAMS',  right: true },
  { key: 'exposurePct',   label: 'EXP %',  right: true },
  { key: 'avgPickNumber', label: 'AVG PK', right: true },
  { key: 'predRate',      label: 'RATE',   right: true, pred: true },
  { key: 'predAVG',       label: 'AVG',    right: true, pred: true },
  { key: 'predMax',       label: 'MAX',    right: true, pred: true },
]

function sort(rows: PlayerExposure[], field: ColKey, dir: SortDirection, getPred: Props['getPred'], split: PredSplit) {
  return [...rows].sort((a, b) => {
    let av: string | number, bv: string | number
    if (field === 'predRate' || field === 'predAVG' || field === 'predMax') {
      const key = field as 'predRate' | 'predAVG' | 'predMax'
      av = getPred(a.player.fullName)?.[split]?.[key] ?? -1
      bv = getPred(b.player.fullName)?.[split]?.[key] ?? -1
    } else {
      switch (field as SortField) {
        case 'name':          av = a.player.fullName;  bv = b.player.fullName;  break
        case 'position':      av = a.player.position;  bv = b.player.position;  break
        case 'nflTeam':       av = a.player.nflTeam;   bv = b.player.nflTeam;   break
        case 'count':         av = a.count;             bv = b.count;            break
        case 'exposurePct':   av = a.exposurePct;       bv = b.exposurePct;      break
        case 'avgPickNumber': av = a.avgPickNumber;     bv = b.avgPickNumber;    break
        default:              av = 0; bv = 0
      }
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

export default function ExposureTable({ exposures, totalEntries, getPred, activeSplit, comboNames = [], onAddToCombo }: Props) {
  const [sortField, setSortField] = useState<ColKey>('exposurePct')
  const [sortDir, setSortDir]     = useState<SortDirection>('desc')

  function handleSort(key: ColKey) {
    if (key === sortField) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(key); setSortDir(key === 'name' || key === 'position' || key === 'nflTeam' ? 'asc' : 'desc') }
  }

  if (exposures.length === 0) return (
    <div className="py-16 text-center text-xs uppercase tracking-widest" style={{ color: '#334155' }}>
      No players match the current filters
    </div>
  )

  const sorted = sort(exposures, sortField, sortDir, getPred, activeSplit)
  const splitHex = SPLIT_COLOR[activeSplit]

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* Prediction group header */}
            <tr style={{ background: 'var(--navy-900)', borderBottom: '1px solid var(--border)' }}>
              <td colSpan={6} style={{ padding: '4px 12px', color: '#334155', fontSize: '10px' }} />
              <td colSpan={3} style={{ padding: '4px 12px', textAlign: 'right', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: splitHex, opacity: 0.7 }}>
                {activeSplit === 'C' ? 'CEILING' : activeSplit === 'M' ? 'MEDIAN' : 'FLOOR'} PROJECTION
              </td>
            </tr>
            <tr style={{ background: 'var(--navy-800)', borderBottom: '1px solid var(--border)' }}>
              {COLS.map(col => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '8px 12px',
                    textAlign: col.right ? 'right' : 'left',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontWeight: 700,
                    letterSpacing: '0.07em',
                    fontSize: '10px',
                    color: col.pred
                      ? sortField === col.key ? splitHex : '#475569'
                      : sortField === col.key ? '#94a3b8' : '#475569',
                    whiteSpace: 'nowrap',
                    borderRight: col.key === 'avgPickNumber' ? '1px solid var(--border)' : undefined,
                    borderLeft: col.key === 'predRate' ? '1px solid var(--border)' : undefined,
                  }}
                >
                  {col.label}
                  {sortField === col.key && <span style={{ marginLeft: 3, color: '#8b5cf6' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((exp, i) => {
              const pred = getPred(exp.player.fullName)
              const sd = pred?.[activeSplit]
              return (
                <tr key={exp.player.appearance}
                  style={{
                    background: i % 2 === 0 ? 'var(--navy-900)' : 'var(--navy-950)',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-700)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--navy-900)' : 'var(--navy-950)')}
                >
                  <td style={{ padding: '7px 12px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                    {onAddToCombo ? (
                      <button
                        onClick={() => onAddToCombo(exp.player.fullName)}
                        title={comboNames.includes(exp.player.fullName) ? 'In combo' : 'Add to combo'}
                        style={{ background: 'none', border: 'none', cursor: comboNames.includes(exp.player.fullName) ? 'default' : 'pointer', padding: 0, color: 'inherit', fontWeight: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        {exp.player.fullName}
                        <span style={{ fontSize: 10, color: comboNames.includes(exp.player.fullName) ? '#7c3aed' : '#334155', fontWeight: 700 }}>
                          {comboNames.includes(exp.player.fullName) ? '●' : '+'}
                        </span>
                      </button>
                    ) : exp.player.fullName}
                  </td>
                  <td style={{ padding: '7px 12px' }}>
                    <span className={`grade-badge text-[10px] ${POS_BADGE[exp.player.position] ?? 'bg-slate-700 text-slate-300'}`}>
                      {exp.player.position}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px', color: '#64748b' }}>{exp.player.nflTeam || '—'}</td>
                  <td style={{ padding: '7px 12px', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                    {exp.count}/{totalEntries}
                  </td>
                  <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 56, height: 4, background: 'var(--navy-700)', borderRadius: 2, overflow: 'hidden' }}>
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
                  {/* Prediction columns */}
                  <td style={{ padding: '7px 12px', textAlign: 'right', borderLeft: '1px solid var(--border)' }}>
                    {sd ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        <div style={{ width: 36, height: 3, background: 'var(--navy-700)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(sd.predRate / 20) * 100}%`, background: splitHex, borderRadius: 2, opacity: 0.7 }} />
                        </div>
                        <span style={{ color: splitHex, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
                          {sd.predRate.toFixed(1)}
                        </span>
                      </div>
                    ) : <span style={{ color: '#1e293b' }}>—</span>}
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
}
