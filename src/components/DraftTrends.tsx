'use client'

import { useMemo } from 'react'
import type { DraftEntry, Position } from '@/lib/types'

interface Props {
  entries: DraftEntry[]
}

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE']

const POS_COLOR: Record<Position, { fill: string; text: string; bg: string }> = {
  QB: { fill: '#f59e0b', text: '#f59e0b', bg: '#78350f22' },
  RB: { fill: '#34d399', text: '#34d399', bg: '#06402222' },
  WR: { fill: '#60a5fa', text: '#60a5fa', bg: '#1e3a5f22' },
  TE: { fill: '#c084fc', text: '#c084fc', bg: '#4a1d9622' },
}

// Typical best ball target positional splits (percentage of picks)
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

  // Determine pick count per team to derive round count
  const picksPerTeam = entries[0]?.picks.length ?? 18
  const roundCount = picksPerTeam  // 1 pick per round in best ball

  // ── Derived Data ────────────────────────────────────────────────────────────

  const { roundMix, picksByPos, rosterCounts } = useMemo(() => {
    // roundMix[round][pos] = count of picks
    const roundMix: Record<number, Record<Position, number>> = {}
    for (let r = 1; r <= roundCount; r++) {
      roundMix[r] = { QB: 0, RB: 0, WR: 0, TE: 0 }
    }

    // picksByPos[pos] = array of all pick numbers
    const picksByPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] }

    // rosterCounts[pos] = array of per-entry counts
    const rosterCounts: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] }

    for (const entry of entries) {
      const entryCount: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }

      // Sort picks by pick number to determine round (1-indexed position in draft order)
      const sorted = [...entry.picks].sort((a, b) => a.pickNumber - b.pickNumber)
      sorted.forEach((pick, idx) => {
        const round = idx + 1
        if (round > roundCount) return
        const pos = pick.player.position
        if (!POSITIONS.includes(pos)) return
        roundMix[round][pos] = (roundMix[round][pos] ?? 0) + 1
        picksByPos[pos].push(pick.pickNumber)
        entryCount[pos]++
      })

      for (const pos of POSITIONS) {
        rosterCounts[pos].push(entryCount[pos])
      }
    }

    // Sort picksByPos arrays
    for (const pos of POSITIONS) {
      picksByPos[pos].sort((a, b) => a - b)
    }

    return { roundMix, picksByPos, rosterCounts }
  }, [entries, roundCount])

  // Round mix as proportions
  const roundProportions = useMemo(() => {
    const result: Record<number, Record<Position, number>> = {}
    for (let r = 1; r <= roundCount; r++) {
      const total = POSITIONS.reduce((s, p) => s + (roundMix[r]?.[p] ?? 0), 0)
      result[r] = { QB: 0, RB: 0, WR: 0, TE: 0 }
      if (total > 0) {
        for (const pos of POSITIONS) {
          result[r][pos] = (roundMix[r]?.[pos] ?? 0) / total
        }
      }
    }
    return result
  }, [roundMix, roundCount])

  // Box plot stats per position
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

  // Overall positional split %
  const overallSplit = useMemo(() => {
    const total = POSITIONS.reduce((s, p) => s + (picksByPos[p]?.length ?? 0), 0)
    return Object.fromEntries(
      POSITIONS.map(pos => [pos, total > 0 ? (picksByPos[pos].length / total) * 100 : 0])
    ) as Record<Position, number>
  }, [picksByPos])

  // Phase breakdown (early 1-6, mid 7-12, late 13+)
  const phases = useMemo(() => {
    const phases: { label: string; rounds: [number, number] }[] = [
      { label: 'Early (Rds 1–6)',  rounds: [1, 6] },
      { label: 'Mid (Rds 7–12)',   rounds: [7, 12] },
      { label: `Late (Rds 13–${roundCount})`, rounds: [13, roundCount] },
    ]
    return phases.map(({ label, rounds: [lo, hi] }) => {
      const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
      for (let r = lo; r <= hi; r++) {
        for (const pos of POSITIONS) {
          counts[pos] += roundMix[r]?.[pos] ?? 0
        }
      }
      const total = POSITIONS.reduce((s, p) => s + counts[p], 0)
      const pct = Object.fromEntries(
        POSITIONS.map(pos => [pos, total > 0 ? (counts[pos] / total) * 100 : 0])
      ) as Record<Position, number>
      return { label, counts, pct, total }
    })
  }, [roundMix, roundCount])

  // Roster construction mode per position
  const rosterMode = useMemo(() => {
    return Object.fromEntries(
      POSITIONS.map(pos => {
        const arr = rosterCounts[pos]
        if (arr.length === 0) return [pos, { min: 0, max: 0, med: 0, distribution: {} }]
        const sortedArr = [...arr].sort((a, b) => a - b)
        const dist: Record<number, number> = {}
        for (const v of arr) dist[v] = (dist[v] ?? 0) + 1
        return [pos, {
          min: sortedArr[0],
          max: sortedArr[sortedArr.length - 1],
          med: percentile(sortedArr, 50),
          distribution: dist,
        }]
      })
    ) as Record<Position, { min: number; max: number; med: number; distribution: Record<number, number> }>
  }, [rosterCounts])

  // ── Heatmap intensity: deviation from average proportion for that position ──
  const avgProp = useMemo(() => {
    return Object.fromEntries(
      POSITIONS.map(pos => {
        const total = Array.from({ length: roundCount }, (_, i) => roundProportions[i + 1]?.[pos] ?? 0)
          .reduce((a, b) => a + b, 0)
        return [pos, total / roundCount]
      })
    ) as Record<Position, number>
  }, [roundProportions, roundCount])

  const maxPickNum = picksPerTeam * totalEntries  // rough upper bound for box plot axis

  return (
    <div className="space-y-8">

      {/* ── 1. Round-by-Round Position Mix ── */}
      <section>
        <h2 className="section-header mb-1">Round-by-Round Position Mix</h2>
        <p className="text-xs mb-4" style={{ color: '#475569' }}>
          Positional share of each round across all {totalEntries} teams. Tall bars for one position signal concentration hot-spots.
        </p>

        {/* Stacked bar chart */}
        <StackedBarChart
          rounds={roundCount}
          proportions={roundProportions}
          roundMix={roundMix}
          totalEntries={totalEntries}
        />

        {/* Heatmap table */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-center border-collapse" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th className="text-left py-1 pr-3 font-semibold uppercase tracking-widest" style={{ color: '#475569', fontSize: 10, width: 40 }}>Pos</th>
                {Array.from({ length: roundCount }, (_, i) => (
                  <th key={i + 1} style={{ color: '#334155', fontWeight: 600, fontSize: 10, padding: '2px 3px', minWidth: 28 }}>
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POSITIONS.map(pos => (
                <tr key={pos}>
                  <td className="text-left py-1 pr-3 font-bold" style={{ color: POS_COLOR[pos].text, fontSize: 11 }}>{pos}</td>
                  {Array.from({ length: roundCount }, (_, i) => {
                    const r = i + 1
                    const prop = roundProportions[r]?.[pos] ?? 0
                    const avg = avgProp[pos]
                    // intensity: how much above average (clamped 0-1)
                    const excess = Math.max(0, prop - avg)
                    const maxExcess = 0.5  // 50pp above average = full color
                    const intensity = Math.min(excess / maxExcess, 1)
                    const count = roundMix[r]?.[pos] ?? 0
                    const pct = Math.round(prop * 100)
                    return (
                      <td key={r} title={`Rd ${r} ${pos}: ${count} picks (${pct}%)`}
                        style={{
                          padding: '2px 3px',
                          borderRadius: 2,
                          background: intensity > 0.05
                            ? `${POS_COLOR[pos].fill}${Math.round(intensity * 200).toString(16).padStart(2, '0')}`
                            : 'transparent',
                          color: intensity > 0.4 ? POS_COLOR[pos].fill : '#334155',
                          fontWeight: intensity > 0.3 ? 700 : 400,
                          cursor: 'default',
                        }}>
                        {count > 0 ? pct : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs" style={{ color: '#334155' }}>
            Values are % of picks in that round at each position. Highlighted cells exceed the position&apos;s average proportion by the most.
          </p>
        </div>
      </section>

      <Divider />

      {/* ── 2. Draft Windows (Box plots) ── */}
      <section>
        <h2 className="section-header mb-1">Positional Draft Windows</h2>
        <p className="text-xs mb-4" style={{ color: '#475569' }}>
          Distribution of pick numbers for each position (P10–P90). Wider boxes indicate more variation in when you take that position.
        </p>
        <BoxPlotChart stats={boxStats} maxPick={picksPerTeam} />
      </section>

      <Divider />

      {/* ── 3 & 4. Roster Construction + Portfolio Balance side-by-side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── 3. Roster Construction ── */}
        <section>
          <h2 className="section-header mb-1">Roster Construction</h2>
          <p className="text-xs mb-4" style={{ color: '#475569' }}>
            How many players at each position you drafted per team.
          </p>
          <div className="space-y-4">
            {POSITIONS.map(pos => {
              const stats = rosterMode[pos]
              const dist = stats.distribution
              const maxCount = Math.max(...Object.values(dist))
              const keys = Object.keys(dist).map(Number).sort((a, b) => a - b)
              return (
                <div key={pos}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].text }}>{pos}</span>
                    <span className="text-xs" style={{ color: '#475569' }}>
                      median {stats.med} · range {stats.min}–{stats.max}
                    </span>
                  </div>
                  <div className="flex gap-1 items-end h-12">
                    {keys.map(k => {
                      const cnt = dist[k]
                      const pct = (cnt / totalEntries) * 100
                      const h = Math.max(4, (cnt / maxCount) * 44)
                      return (
                        <div key={k} className="flex flex-col items-center gap-0.5" style={{ flex: 1 }}>
                          <div title={`${cnt} teams (${Math.round(pct)}%)`}
                            style={{
                              height: h, width: '100%',
                              background: POS_COLOR[pos].fill,
                              opacity: 0.7,
                              borderRadius: '2px 2px 0 0',
                            }} />
                          <span style={{ fontSize: 9, color: '#475569' }}>{k}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {keys.map(k => {
                      const cnt = dist[k]
                      const pct = Math.round((cnt / totalEntries) * 100)
                      return (
                        <div key={k} style={{ flex: 1, fontSize: 9, textAlign: 'center', color: '#475569' }}>
                          {pct}%
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
          <p className="text-xs mb-4" style={{ color: '#475569' }}>
            Your overall positional split vs. typical best ball targets.
          </p>
          <div className="space-y-3">
            {POSITIONS.map(pos => {
              const actual = overallSplit[pos]
              const target = TARGET_SPLIT[pos]
              // FLEX slots add ~13% extra that doesn't map cleanly to one position
              // so we label these as indicative targets
              const diff = actual - target
              const absDiff = Math.abs(diff)
              const status = absDiff <= 3 ? 'on-track' : diff > 0 ? 'over' : 'under'
              const statusColor = status === 'on-track' ? '#34d399' : status === 'over' ? '#f59e0b' : '#60a5fa'
              const statusLabel = status === 'on-track' ? 'On track' : status === 'over' ? `+${Math.round(diff)}pp over` : `${Math.round(diff)}pp under`
              return (
                <div key={pos}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].text }}>{pos}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: '#475569' }}>
                        {Math.round(actual)}% actual · {target}% target
                      </span>
                      <span className="text-xs font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
                    </div>
                  </div>
                  {/* Stacked bar: actual vs target */}
                  <div className="relative h-4 rounded overflow-hidden" style={{ background: '#0f172a' }}>
                    {/* Target marker */}
                    <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${target}%`, background: '#475569' }} />
                    {/* Actual bar */}
                    <div className="absolute top-0 left-0 bottom-0 transition-all" style={{
                      width: `${Math.min(100, actual)}%`,
                      background: POS_COLOR[pos].fill,
                      opacity: 0.75,
                      borderRadius: 2,
                    }} />
                    {/* Labels */}
                    <div className="absolute inset-0 flex items-center px-2 justify-between pointer-events-none">
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#0f172a', mixBlendMode: 'difference', opacity: 0.8 }}>
                        {Math.round(actual)}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            <p className="text-xs pt-1" style={{ color: '#334155' }}>
              Targets are indicative (FLEX picks shared across RB/WR/TE). ±3pp = on track.
            </p>
          </div>
        </section>
      </div>

      <Divider />

      {/* ── 5. Phase Tendencies ── */}
      <section>
        <h2 className="section-header mb-1">Draft Phase Tendencies</h2>
        <p className="text-xs mb-4" style={{ color: '#475569' }}>
          How you allocate picks across the early, middle, and late rounds of the draft.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {phases.map(phase => (
            <div key={phase.label} className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
              <div className="text-xs font-semibold mb-3" style={{ color: '#94a3b8' }}>{phase.label}</div>
              <div className="space-y-2">
                {POSITIONS.map(pos => {
                  const count = phase.counts[pos]
                  const pct = phase.pct[pos]
                  const maxPct = Math.max(...POSITIONS.map(p => phase.pct[p]))
                  const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
                  return (
                    <div key={pos}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].text, fontSize: 11 }}>{pos}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>{count} picks · {Math.round(pct)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
                        <div style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          background: POS_COLOR[pos].fill,
                          borderRadius: 9999,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 text-xs" style={{ color: '#334155' }}>
                {phase.total} total picks
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <div className="border-t" style={{ borderColor: 'var(--border)' }} />
}

interface StackedBarChartProps {
  rounds: number
  proportions: Record<number, Record<Position, number>>
  roundMix: Record<number, Record<Position, number>>
  totalEntries: number
}

function StackedBarChart({ rounds, proportions, roundMix, totalEntries }: StackedBarChartProps) {
  const BAR_H = 120
  const BAR_W = 24
  const GAP = 4
  const PAD_L = 28
  const PAD_B = 20
  const totalW = PAD_L + rounds * (BAR_W + GAP)
  const totalH = BAR_H + PAD_B + 8

  return (
    <div className="overflow-x-auto">
      <svg width={totalW} height={totalH} style={{ display: 'block', minWidth: totalW }}>
        {/* Y axis labels */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = BAR_H - (v / 100) * BAR_H + 4
          return (
            <g key={v}>
              <line x1={PAD_L - 4} x2={PAD_L + rounds * (BAR_W + GAP)} y1={y} y2={y}
                stroke="#1e293b" strokeWidth={1} />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#334155">{v}</text>
            </g>
          )
        })}

        {/* Bars */}
        {Array.from({ length: rounds }, (_, i) => {
          const r = i + 1
          const x = PAD_L + i * (BAR_W + GAP)
          const prop = proportions[r] ?? { QB: 0, RB: 0, WR: 0, TE: 0 }
          let cumY = BAR_H + 4

          return (
            <g key={r}>
              {POSITIONS.map(pos => {
                const h = prop[pos] * BAR_H
                cumY -= h
                const count = roundMix[r]?.[pos] ?? 0
                return (
                  <rect key={pos}
                    x={x} y={cumY} width={BAR_W} height={h}
                    fill={POS_COLOR[pos].fill}
                    opacity={0.8}
                  >
                    <title>{`Rd ${r} ${pos}: ${count} picks (${Math.round(prop[pos] * 100)}%)`}</title>
                  </rect>
                )
              })}
              {/* Round label */}
              <text x={x + BAR_W / 2} y={BAR_H + 4 + 12} textAnchor="middle" fontSize={9} fill="#334155">
                {r}
              </text>
            </g>
          )
        })}

        {/* Legend */}
        {POSITIONS.map((pos, i) => (
          <g key={pos} transform={`translate(${PAD_L + i * 52}, ${totalH - 4})`}>
            <rect width={8} height={8} fill={POS_COLOR[pos].fill} opacity={0.8} rx={1} />
            <text x={11} y={8} fontSize={9} fill={POS_COLOR[pos].text}>{pos}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

interface BoxPlotChartProps {
  stats: Record<Position, { p10: number; q1: number; med: number; q3: number; p90: number } | null>
  maxPick: number
}

function BoxPlotChart({ stats, maxPick }: BoxPlotChartProps) {
  const ROW_H = 40
  const PAD_L = 44
  const PAD_R = 20
  const chartW = 520
  const innerW = chartW - PAD_L - PAD_R
  const totalH = POSITIONS.length * ROW_H + 24

  const scale = (v: number) => PAD_L + (v / maxPick) * innerW

  // Tick marks every 3 rounds
  const ticks = Array.from({ length: Math.floor(maxPick / 3) + 1 }, (_, i) => i * 3).filter(t => t <= maxPick)

  return (
    <div className="overflow-x-auto">
      <svg width={chartW} height={totalH} style={{ display: 'block', minWidth: 400 }}>
        {/* Grid lines */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={scale(t)} x2={scale(t)} y1={0} y2={POSITIONS.length * ROW_H}
              stroke="#1e293b" strokeWidth={1} />
            <text x={scale(t)} y={POSITIONS.length * ROW_H + 14} textAnchor="middle" fontSize={9} fill="#334155">
              {t}
            </text>
          </g>
        ))}

        {POSITIONS.map((pos, i) => {
          const s = stats[pos]
          const cy = i * ROW_H + ROW_H / 2
          const color = POS_COLOR[pos].fill

          return (
            <g key={pos}>
              <text x={PAD_L - 6} y={cy + 4} textAnchor="end" fontSize={11} fontWeight={700} fill={color}>{pos}</text>
              {s && (
                <>
                  {/* Whiskers */}
                  <line x1={scale(s.p10)} x2={scale(s.q1)} y1={cy} y2={cy} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.5} />
                  <line x1={scale(s.q3)} x2={scale(s.p90)} y1={cy} y2={cy} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" opacity={0.5} />
                  {/* IQR box */}
                  <rect x={scale(s.q1)} y={cy - 9} width={scale(s.q3) - scale(s.q1)} height={18}
                    fill={color} opacity={0.2} rx={2} />
                  <rect x={scale(s.q1)} y={cy - 9} width={scale(s.q3) - scale(s.q1)} height={18}
                    fill="none" stroke={color} strokeWidth={1.5} rx={2} opacity={0.6} />
                  {/* Median line */}
                  <line x1={scale(s.med)} x2={scale(s.med)} y1={cy - 9} y2={cy + 9}
                    stroke={color} strokeWidth={2.5} />
                  {/* P10/P90 caps */}
                  <line x1={scale(s.p10)} x2={scale(s.p10)} y1={cy - 5} y2={cy + 5} stroke={color} strokeWidth={1.5} opacity={0.5} />
                  <line x1={scale(s.p90)} x2={scale(s.p90)} y1={cy - 5} y2={cy + 5} stroke={color} strokeWidth={1.5} opacity={0.5} />
                  {/* Labels */}
                  <text x={scale(s.med)} y={cy - 13} textAnchor="middle" fontSize={9} fill={color} fontWeight={600}>
                    {Math.round(s.med)}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
