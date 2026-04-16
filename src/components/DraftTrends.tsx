'use client'

import { useMemo } from 'react'
import type { DraftEntry, Position } from '@/lib/types'

interface Props {
  entries: DraftEntry[]
}

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

const POS_COLOR: Record<Position, { fill: string; muted: string }> = {
  QB: { fill: '#f59e0b', muted: '#78350f' },
  RB: { fill: '#34d399', muted: '#065f46' },
  WR: { fill: '#60a5fa', muted: '#1e40af' },
  TE: { fill: '#c084fc', muted: '#6b21a8' },
}

// Indicative best ball target positional splits (percentage of picks)
const TARGET_SPLIT: Record<Position, number> = { QB: 8, RB: 29, WR: 42, TE: 8 }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export default function DraftTrends({ entries }: Props) {
  const totalEntries = entries.length
  if (totalEntries === 0) return null

  const picksPerTeam = entries[0]?.picks.length ?? 18
  const roundCount = picksPerTeam

  // ── Derived data ─────────────────────────────────────────────────────────────

  const { roundMix, picksByPos, rosterCounts } = useMemo(() => {
    const roundMix: Record<number, Record<Position, number>> = {}
    for (let r = 1; r <= roundCount; r++) roundMix[r] = { QB: 0, RB: 0, WR: 0, TE: 0 }

    const picksByPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] }
    const rosterCounts: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] }

    for (const entry of entries) {
      const entryCount: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
      const sorted = [...entry.picks].sort((a, b) => a.pickNumber - b.pickNumber)
      sorted.forEach((pick, idx) => {
        const round = idx + 1
        if (round > roundCount) return
        const pos = pick.player.position
        if (!POSITIONS.includes(pos)) return
        roundMix[round][pos] = (roundMix[round][pos] ?? 0) + 1
        // Store team-relative round (1–N), not global pick number, so the
        // box plot axis matches the rounds scale used everywhere else.
        picksByPos[pos].push(round)
        entryCount[pos]++
      })
      for (const pos of POSITIONS) rosterCounts[pos].push(entryCount[pos])
    }
    for (const pos of POSITIONS) picksByPos[pos].sort((a, b) => a - b)
    return { roundMix, picksByPos, rosterCounts }
  }, [entries, roundCount])

  const roundProportions = useMemo(() => {
    const result: Record<number, Record<Position, number>> = {}
    for (let r = 1; r <= roundCount; r++) {
      const total = POSITIONS.reduce((s, p) => s + (roundMix[r]?.[p] ?? 0), 0)
      result[r] = { QB: 0, RB: 0, WR: 0, TE: 0 }
      if (total > 0) {
        for (const pos of POSITIONS) result[r][pos] = (roundMix[r]?.[pos] ?? 0) / total
      }
    }
    return result
  }, [roundMix, roundCount])

  const boxStats = useMemo(() => {
    return Object.fromEntries(
      POSITIONS.map(pos => {
        const arr = picksByPos[pos]
        if (arr.length === 0) return [pos, null]
        return [pos, {
          p10: percentile(arr, 10),
          q1:  percentile(arr, 25),
          med: percentile(arr, 50),
          q3:  percentile(arr, 75),
          p90: percentile(arr, 90),
        }]
      })
    ) as Record<Position, { p10: number; q1: number; med: number; q3: number; p90: number } | null>
  }, [picksByPos])

  const overallSplit = useMemo(() => {
    const total = POSITIONS.reduce((s, p) => s + (picksByPos[p]?.length ?? 0), 0)
    return Object.fromEntries(
      POSITIONS.map(pos => [pos, total > 0 ? (picksByPos[pos].length / total) * 100 : 0])
    ) as Record<Position, number>
  }, [picksByPos])

  const phases = useMemo(() => {
    const defs: { label: string; rounds: [number, number] }[] = [
      { label: 'Early (Rds 1–6)',             rounds: [1, 6]          },
      { label: 'Mid (Rds 7–12)',               rounds: [7, 12]         },
      { label: `Late (Rds 13–${roundCount})`, rounds: [13, roundCount] },
    ]
    return defs.map(({ label, rounds: [lo, hi] }) => {
      const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
      for (let r = lo; r <= hi; r++) for (const pos of POSITIONS) counts[pos] += roundMix[r]?.[pos] ?? 0
      const total = POSITIONS.reduce((s, p) => s + counts[p], 0)
      const pct = Object.fromEntries(
        POSITIONS.map(pos => [pos, total > 0 ? (counts[pos] / total) * 100 : 0])
      ) as Record<Position, number>
      return { label, counts, pct, total }
    })
  }, [roundMix, roundCount])

  const rosterMode = useMemo(() => {
    return Object.fromEntries(
      POSITIONS.map(pos => {
        const arr = rosterCounts[pos]
        if (arr.length === 0) return [pos, { min: 0, max: 0, med: 0, distribution: {} }]
        const sortedArr = [...arr].sort((a, b) => a - b)
        const dist: Record<number, number> = {}
        for (const v of arr) dist[v] = (dist[v] ?? 0) + 1
        return [pos, { min: sortedArr[0], max: sortedArr[sortedArr.length - 1], med: percentile(sortedArr, 50), distribution: dist }]
      })
    ) as Record<Position, { min: number; max: number; med: number; distribution: Record<number, number> }>
  }, [rosterCounts])

  // Per-position average proportion across rounds (for heatmap baseline)
  const avgProp = useMemo(() => {
    return Object.fromEntries(
      POSITIONS.map(pos => {
        const sum = Array.from({ length: roundCount }, (_, i) => roundProportions[i + 1]?.[pos] ?? 0)
          .reduce((a, b) => a + b, 0)
        return [pos, sum / roundCount]
      })
    ) as Record<Position, number>
  }, [roundProportions, roundCount])

  return (
    <div className="space-y-8">

      {/* ── 1. Round-by-Round Position Mix ── */}
      <section>
        <h2 className="section-header mb-1">Round-by-Round Position Mix</h2>
        <p className="text-xs mb-4" style={{ color: '#64748b' }}>
          Positional share of each round across all {totalEntries} teams. Tall bars for one position signal concentration hot-spots.
        </p>

        <StackedBarChart rounds={roundCount} proportions={roundProportions} roundMix={roundMix} />

        {/* Heatmap */}
        <div className="mt-5 overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--navy-800)' }}>
          <table className="w-full text-center border-collapse" style={{ fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-2 pl-3 pr-4 font-semibold uppercase tracking-widest"
                  style={{ color: '#475569', fontSize: 10, width: 44 }}>Pos</th>
                {Array.from({ length: roundCount }, (_, i) => (
                  <th key={i + 1} style={{ color: '#64748b', fontWeight: 600, fontSize: 10, padding: '4px 3px', minWidth: 28 }}>
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map((pos, pi) => (
                <tr key={pos} style={{ borderTop: pi > 0 ? '1px solid #1e293b' : undefined }}>
                  <td className="py-2 pl-3 pr-4 text-left font-bold" style={{ color: POS_COLOR[pos].fill, fontSize: 11 }}>{pos}</td>
                  {Array.from({ length: roundCount }, (_, i) => {
                    const r = i + 1
                    const prop = roundProportions[r]?.[pos] ?? 0
                    const avg = avgProp[pos]
                    const excess = Math.max(0, prop - avg)
                    const intensity = Math.min(excess / 0.45, 1)
                    const count = roundMix[r]?.[pos] ?? 0
                    const pct = Math.round(prop * 100)
                    // Background: position color at scaled opacity; text always readable
                    const bgAlpha = Math.round(intensity * 180).toString(16).padStart(2, '0')
                    return (
                      <td key={r}
                        title={`Rd ${r} ${pos}: ${count} picks (${pct}%)`}
                        style={{
                          padding: '4px 3px',
                          background: intensity > 0.08 ? `${POS_COLOR[pos].fill}${bgAlpha}` : 'transparent',
                          // Always use white-ish text; only boost weight for hot cells
                          color: intensity > 0.35 ? '#f1f5f9' : '#64748b',
                          fontWeight: intensity > 0.35 ? 700 : 400,
                          cursor: 'default',
                          transition: 'background 0.15s',
                        }}>
                        {count > 0 ? pct : <span style={{ color: '#1e293b' }}>–</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: '#475569' }}>
          Values show % of picks in that round. Highlighted cells are well above the position&apos;s average round share.
        </p>
      </section>

      <Divider />

      {/* ── 2. Draft Windows ── */}
      <section>
        <h2 className="section-header mb-1">Positional Draft Windows</h2>
        <p className="text-xs mb-4" style={{ color: '#64748b' }}>
          Distribution of draft rounds for each position (P10 – P90). A wider box means more variation in when you target that position.
        </p>
        <BoxPlotChart stats={boxStats} maxPick={picksPerTeam} />
      </section>

      <Divider />

      {/* ── 3 & 4 side-by-side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 3. Roster Construction ── */}
        <section>
          <h2 className="section-header mb-1">Roster Construction</h2>
          <p className="text-xs mb-4" style={{ color: '#64748b' }}>
            How many players at each position per team across your portfolio.
          </p>
          <div className="space-y-5">
            {POSITIONS.map(pos => {
              const stats = rosterMode[pos]
              const dist = stats.distribution
              const maxCount = Math.max(...Object.values(dist))
              const keys = Object.keys(dist).map(Number).sort((a, b) => a - b)
              return (
                <div key={pos}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].fill }}>{pos}</span>
                    <span className="text-xs" style={{ color: '#64748b' }}>
                      median {stats.med} &nbsp;·&nbsp; range {stats.min}–{stats.max}
                    </span>
                  </div>
                  <div className="flex gap-1.5 items-end" style={{ height: 52 }}>
                    {keys.map(k => {
                      const cnt = dist[k]
                      const pct = Math.round((cnt / totalEntries) * 100)
                      const h = Math.max(6, (cnt / maxCount) * 44)
                      return (
                        <div key={k} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                          <span style={{ fontSize: 9, color: '#64748b', lineHeight: 1 }}>{pct}%</span>
                          <div title={`${cnt} teams (${pct}%)`}
                            style={{
                              height: h, width: '100%',
                              background: POS_COLOR[pos].fill,
                              opacity: 0.75,
                              borderRadius: '2px 2px 0 0',
                            }} />
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{k}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 4. Portfolio Balance ── */}
        <section>
          <h2 className="section-header mb-1">Portfolio Balance</h2>
          <p className="text-xs mb-4" style={{ color: '#64748b' }}>
            Your overall positional split vs. indicative best ball targets.
          </p>
          <div className="space-y-4">
            {POSITIONS.map(pos => {
              const actual = overallSplit[pos]
              const target = TARGET_SPLIT[pos]
              const diff = actual - target
              const absDiff = Math.abs(diff)
              const status = absDiff <= 3 ? 'ok' : diff > 0 ? 'over' : 'under'
              const statusColor = status === 'ok' ? '#34d399' : status === 'over' ? '#fb923c' : '#60a5fa'
              const statusLabel = status === 'ok' ? 'On track' : status === 'over'
                ? `+${Math.round(diff)}pp over`
                : `${Math.round(diff)}pp under`
              return (
                <div key={pos}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].fill }}>{pos}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#94a3b8' }}>
                        {Math.round(actual)}% <span style={{ color: '#475569' }}>actual</span>
                        &nbsp;·&nbsp;
                        {target}% <span style={{ color: '#475569' }}>target</span>
                      </span>
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30` }}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  {/* Track */}
                  <div className="relative h-5 rounded" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                    {/* Actual fill */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, bottom: 0,
                      width: `${Math.min(100, actual)}%`,
                      background: POS_COLOR[pos].fill,
                      opacity: 0.5,
                      borderRadius: 3,
                    }} />
                    {/* Target tick */}
                    <div style={{
                      position: 'absolute', top: 2, bottom: 2, width: 2, borderRadius: 1,
                      left: `${target}%`,
                      background: '#94a3b8',
                    }} />
                    {/* Actual % label — always outside the bar fill */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 6, paddingRight: 6,
                      pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.02em' }}>
                        {Math.round(actual)}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            <p className="text-xs pt-1" style={{ color: '#475569' }}>
              Vertical tick = target. FLEX picks are shared across RB/WR/TE so targets are indicative. ±3pp = on track.
            </p>
          </div>
        </section>
      </div>

      <Divider />

      {/* ── 5. Phase Tendencies ── */}
      <section>
        <h2 className="section-header mb-1">Draft Phase Tendencies</h2>
        <p className="text-xs mb-4" style={{ color: '#64748b' }}>
          How you allocate picks across the early, middle, and late rounds of the draft.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {phases.map(phase => (
            <div key={phase.label} className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
              <div className="text-xs font-semibold mb-3" style={{ color: '#94a3b8' }}>{phase.label}</div>
              <div className="space-y-3">
                {POSITIONS.map(pos => {
                  const count = phase.counts[pos]
                  const pct = phase.pct[pos]
                  const maxPct = Math.max(...POSITIONS.map(p => phase.pct[p]))
                  const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
                  return (
                    <div key={pos}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].fill }}>{pos}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{count} picks · {Math.round(pct)}%</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
                        <div style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          background: POS_COLOR[pos].fill,
                          opacity: 0.75,
                          borderRadius: 9999,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-xs font-medium" style={{ color: '#475569' }}>
                {phase.total} total picks
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider() {
  return <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
}

interface StackedBarChartProps {
  rounds: number
  proportions: Record<number, Record<Position, number>>
  roundMix: Record<number, Record<Position, number>>
}

function StackedBarChart({ rounds, proportions, roundMix }: StackedBarChartProps) {
  const BAR_H  = 130
  const BAR_W  = 24
  const GAP    = 4
  const PAD_L  = 30
  const PAD_T  = 6
  const AXIS_H = 18  // space for round-number labels
  const svgW   = PAD_L + rounds * (BAR_W + GAP)
  const svgH   = PAD_T + BAR_H + AXIS_H

  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}>
          {/* Y-axis gridlines + labels */}
          {[0, 25, 50, 75, 100].map(v => {
            const y = PAD_T + BAR_H - (v / 100) * BAR_H
            return (
              <g key={v}>
                <line x1={PAD_L - 4} x2={svgW} y1={y} y2={y} stroke="#1e293b" strokeWidth={1} />
                <text x={PAD_L - 7} y={y + 3.5} textAnchor="end" fontSize={9} fill="#64748b">{v}</text>
              </g>
            )
          })}

          {/* Stacked bars */}
          {Array.from({ length: rounds }, (_, i) => {
            const r = i + 1
            const x = PAD_L + i * (BAR_W + GAP)
            const prop = proportions[r] ?? { QB: 0, RB: 0, WR: 0, TE: 0 }
            let cumY = PAD_T + BAR_H
            return (
              <g key={r}>
                {POSITIONS.map(pos => {
                  const h = prop[pos] * BAR_H
                  cumY -= h
                  const count = roundMix[r]?.[pos] ?? 0
                  return (
                    <rect key={pos} x={x} y={cumY} width={BAR_W} height={Math.max(h, 0)}
                      fill={POS_COLOR[pos].fill} opacity={0.85} rx={0}>
                      <title>{`Rd ${r} ${pos}: ${count} picks (${Math.round(prop[pos] * 100)}%)`}</title>
                    </rect>
                  )
                })}
                <text x={x + BAR_W / 2} y={PAD_T + BAR_H + 13} textAnchor="middle" fontSize={9} fill="#64748b">
                  {r}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* Legend below chart as HTML — avoids SVG clipping */}
      <div className="flex gap-4 mt-2 flex-wrap">
        {POSITIONS.map(pos => (
          <div key={pos} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: POS_COLOR[pos].fill, opacity: 0.85 }} />
            <span style={{ fontSize: 11, color: POS_COLOR[pos].fill, fontWeight: 600 }}>{pos}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface BoxPlotChartProps {
  stats: Record<Position, { p10: number; q1: number; med: number; q3: number; p90: number } | null>
  maxPick: number
}

function BoxPlotChart({ stats, maxPick }: BoxPlotChartProps) {
  const ROW_H  = 48
  const PAD_L  = 44
  const PAD_R  = 24
  const PAD_T  = 6
  const chartW = 560
  const innerW = chartW - PAD_L - PAD_R
  const axisH  = 18
  const svgH   = PAD_T + POSITIONS.length * ROW_H + axisH

  const scale = (v: number) => PAD_L + (v / maxPick) * innerW

  // Tick every 3 picks
  const ticks = Array.from({ length: Math.floor(maxPick / 3) + 1 }, (_, i) => i * 3).filter(t => t <= maxPick)

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={svgH} style={{ display: 'block', minWidth: 400 }}>
        {/* Grid + axis labels */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={scale(t)} x2={scale(t)} y1={PAD_T} y2={PAD_T + POSITIONS.length * ROW_H}
              stroke="#1e293b" strokeWidth={1} />
            <text x={scale(t)} y={PAD_T + POSITIONS.length * ROW_H + 14} textAnchor="middle" fontSize={9} fill="#64748b">
              {t}
            </text>
          </g>
        ))}

        {/* Row backgrounds for alternating rows */}
        {POSITIONS.map((_, i) => (
          i % 2 === 1 ? (
            <rect key={i} x={PAD_L} y={PAD_T + i * ROW_H} width={innerW} height={ROW_H} fill="#0f172a" opacity={0.5} />
          ) : null
        ))}

        {POSITIONS.map((pos, i) => {
          const s = stats[pos]
          const cy = PAD_T + i * ROW_H + ROW_H / 2
          const color = POS_COLOR[pos].fill

          return (
            <g key={pos}>
              {/* Position label */}
              <text x={PAD_L - 8} y={cy + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={color}>{pos}</text>

              {s && (
                <>
                  {/* P10–Q1 whisker */}
                  <line x1={scale(s.p10)} x2={scale(s.q1)} y1={cy} y2={cy}
                    stroke={color} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.55} />
                  {/* Q3–P90 whisker */}
                  <line x1={scale(s.q3)} x2={scale(s.p90)} y1={cy} y2={cy}
                    stroke={color} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.55} />
                  {/* IQR box fill */}
                  <rect x={scale(s.q1)} y={cy - 10} width={Math.max(scale(s.q3) - scale(s.q1), 1)} height={20}
                    fill={color} opacity={0.18} rx={2} />
                  {/* IQR box border */}
                  <rect x={scale(s.q1)} y={cy - 10} width={Math.max(scale(s.q3) - scale(s.q1), 1)} height={20}
                    fill="none" stroke={color} strokeWidth={1.5} opacity={0.65} rx={2} />
                  {/* Median bar */}
                  <line x1={scale(s.med)} x2={scale(s.med)} y1={cy - 10} y2={cy + 10}
                    stroke={color} strokeWidth={3} opacity={0.95} />
                  {/* P10/P90 end caps */}
                  <line x1={scale(s.p10)} x2={scale(s.p10)} y1={cy - 5} y2={cy + 5}
                    stroke={color} strokeWidth={1.5} opacity={0.55} />
                  <line x1={scale(s.p90)} x2={scale(s.p90)} y1={cy - 5} y2={cy + 5}
                    stroke={color} strokeWidth={1.5} opacity={0.55} />
                  {/* Median value label */}
                  <text x={scale(s.med)} y={cy - 14} textAnchor="middle" fontSize={10} fill={color} fontWeight={700}>
                    {Math.round(s.med)}
                  </text>
                  {/* Q1/Q3 range label */}
                  <text x={(scale(s.q1) + scale(s.q3)) / 2} y={cy + 22} textAnchor="middle" fontSize={8} fill={color} opacity={0.6}>
                    {Math.round(s.q1)}–{Math.round(s.q3)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* Axis label */}
        <text x={PAD_L + innerW / 2} y={svgH} textAnchor="middle" fontSize={9} fill="#64748b">
          Round
        </text>
      </svg>
    </div>
  )
}
