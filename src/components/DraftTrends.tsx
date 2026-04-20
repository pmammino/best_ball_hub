'use client'

import { useMemo, useState } from 'react'
import type { DraftEntry, Position } from '@/lib/types'
import type { TeamScore } from '@/lib/scoreTeam'
import { TIER_STYLE } from '@/lib/scoreTeam'

type MixMode = 'share' | 'relative'
type PlayerInfo = { name: string; pos: Position; count: number; pct: number }

interface Props {
  entries: DraftEntry[]
  teamScores: Map<string, TeamScore>
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

export default function DraftTrends({ entries, teamScores }: Props) {
  const totalEntries = entries.length
  const [mixMode, setMixMode] = useState<MixMode>('share')

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

  // QB-RB-WR-TE combo frequency across all entries
  const rosterCombos = useMemo(() => {
    const n = rosterCounts.QB.length
    const freq: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const key = `${rosterCounts.QB[i]}-${rosterCounts.RB[i]}-${rosterCounts.WR[i]}-${rosterCounts.TE[i]}`
      freq[key] = (freq[key] ?? 0) + 1
    }
    return Object.entries(freq)
      .map(([key, count]) => {
        const [qb, rb, wr, te] = key.split('-').map(Number)
        return { qb, rb, wr, te, count }
      })
      .sort((a, b) => b.count - a.count)
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

  // Distribution of team score components across the portfolio
  const scoreStats = useMemo(() => {
    const scores = Array.from(teamScores, ([, v]) => v)
    if (scores.length === 0) return null
    type MetricKey = 'pQB' | 'pRB' | 'pWR' | 'pTE' | 'pCeil'
    const metrics: MetricKey[] = ['pQB', 'pRB', 'pWR', 'pTE', 'pCeil']
    return Object.fromEntries(metrics.map(k => {
      const vals = scores.map(s => s[k]).sort((a, b) => a - b)
      const avg  = vals.reduce((a, b) => a + b, 0) / vals.length
      return [k, { min: vals[0], p25: percentile(vals, 25), med: percentile(vals, 50), avg, p75: percentile(vals, 75), max: vals[vals.length - 1] }]
    })) as Record<'pQB'|'pRB'|'pWR'|'pTE'|'pCeil', { min:number; p25:number; med:number; avg:number; p75:number; max:number }>
  }, [teamScores])

  // Grade tier distribution
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    Array.from(teamScores, ([, s]) => s).forEach(s => { counts[s.tier] = (counts[s.tier] ?? 0) + 1 })
    return counts
  }, [teamScores])

  // ── Variability: per-player exposure distribution ─────────────────────────
  const { playerDist, coMatrix } = useMemo(() => {
    const infoMap: Record<string, PlayerInfo> = {}
    for (const entry of entries) {
      for (const pick of entry.picks) {
        const n = pick.player.fullName
        if (!infoMap[n]) infoMap[n] = { name: n, pos: pick.player.position, count: 0, pct: 0 }
        infoMap[n].count++
      }
    }
    for (const p of Object.values(infoMap)) p.pct = (p.count / totalEntries) * 100

    const byPos: Record<Position, PlayerInfo[]> = { QB: [], RB: [], WR: [], TE: [] }
    for (const p of Object.values(infoMap)) {
      if (POSITIONS.includes(p.pos)) byPos[p.pos].push(p)
    }
    for (const pos of POSITIONS) byPos[pos].sort((a, b) => b.count - a.count)

    // Co-occurrence counts: coMatrix[A][B] = number of teams that have both
    const co: Record<string, Record<string, number>> = {}
    for (const entry of entries) {
      const names = entry.picks.map(p => p.player.fullName)
      for (const a of names) {
        if (!co[a]) co[a] = {}
        for (const b of names) {
          if (a !== b) co[a][b] = (co[a][b] ?? 0) + 1
        }
      }
    }
    return { playerDist: { byPos, infoMap }, coMatrix: co }
  }, [entries, totalEntries])

  // Notable pairs: both players on ≥ 2 teams, co-appear ≥ 2 times
  const notablePairs = useMemo(() => {
    const seen = new Set<string>()
    const pairs: { a: PlayerInfo; b: PlayerInfo; coCount: number; condA: number; condB: number }[] = []
    for (const [aName, companions] of Object.entries(coMatrix)) {
      const aInfo = playerDist.infoMap[aName]
      if (!aInfo || aInfo.count < 2) continue
      for (const [bName, coCount] of Object.entries(companions)) {
        const key = [aName, bName].sort().join('|||')
        if (seen.has(key)) continue
        seen.add(key)
        const bInfo = playerDist.infoMap[bName]
        if (!bInfo || bInfo.count < 2 || coCount < 2) continue
        pairs.push({ a: aInfo, b: bInfo, coCount, condA: coCount / aInfo.count, condB: coCount / bInfo.count })
      }
    }
    return pairs.sort((x, y) => {
      const xMax = Math.max(x.condA, x.condB), yMax = Math.max(y.condA, y.condB)
      return yMax !== xMax ? yMax - xMax : y.coCount - x.coCount
    })
  }, [coMatrix, playerDist])

  const [focusedPlayer, setFocusedPlayer] = useState<string | null>(null)

  return (
    <div className="space-y-8">

      {/* ── 1. Round-by-Round Position Mix ── */}
      <section>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
          <h2 className="section-header">Round-by-Round Position Mix</h2>
          <ModeToggle mode={mixMode} onChange={setMixMode} />
        </div>
        <p className="text-xs mb-4" style={{ color: '#64748b' }}>
          {mixMode === 'share'
            ? `Positional share of each round across all ${totalEntries} teams. Tall bars for one position signal concentration hot-spots.`
            : `Each round's positional share vs. your overall portfolio average. 1.0× = on pace, >1× = over-indexing, <1× = under-indexing.`}
        </p>

        {mixMode === 'share' ? (
          <StackedBarChart rounds={roundCount} proportions={roundProportions} roundMix={roundMix} />
        ) : (
          <RelativeChart
            rounds={roundCount}
            proportions={roundProportions}
            avgProp={avgProp}
            roundMix={roundMix}
          />
        )}

        {/* Heatmap */}
        <div className="mt-5 overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--navy-800)' }}>
          <table className="w-full text-center border-collapse" style={{ fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left py-2 pl-3 pr-4 font-semibold uppercase tracking-widest"
                  style={{ color: '#64748b', fontSize: 10, width: 44 }}>Pos</th>
                {mixMode === 'relative' && (
                  <th className="text-right pr-3 font-semibold uppercase tracking-widest"
                    style={{ color: '#64748b', fontSize: 10, width: 44 }}>Avg</th>
                )}
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
                  {mixMode === 'relative' && (
                    <td className="text-right pr-3" style={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>
                      {Math.round(avgProp[pos] * 100)}%
                    </td>
                  )}
                  {Array.from({ length: roundCount }, (_, i) => {
                    const r = i + 1
                    const prop = roundProportions[r]?.[pos] ?? 0
                    const avg = avgProp[pos]
                    const count = roundMix[r]?.[pos] ?? 0
                    const pct = Math.round(prop * 100)

                    if (mixMode === 'share') {
                      const excess = Math.max(0, prop - avg)
                      const intensity = Math.min(excess / 0.45, 1)
                      const bgAlpha = Math.round(intensity * 180).toString(16).padStart(2, '0')
                      return (
                        <td key={r}
                          title={`Rd ${r} ${pos}: ${count} picks (${pct}%)`}
                          style={{
                            padding: '4px 3px',
                            background: intensity > 0.08 ? `${POS_COLOR[pos].fill}${bgAlpha}` : 'transparent',
                            color: intensity > 0.35 ? '#f1f5f9' : '#64748b',
                            fontWeight: intensity > 0.35 ? 700 : 400,
                            cursor: 'default',
                            transition: 'background 0.15s',
                          }}>
                          {count > 0 ? pct : <span style={{ color: '#334155' }}>–</span>}
                        </td>
                      )
                    }

                    // relative mode: show ratio vs overall average
                    const ratio = avg > 0 ? prop / avg : 0
                    // Intensity for over-indexing (ratio > 1) or under-indexing (ratio < 1 but > 0)
                    const over  = ratio > 1.1
                    const under = ratio > 0 && ratio < 0.9
                    // Scale magnitude: 2.5× or 0.4× = full intensity
                    const overIntensity  = Math.min((ratio - 1) / 1.5, 1)
                    const underIntensity = Math.min((1 - ratio) / 0.6, 1)
                    let bg = 'transparent'
                    let color = '#64748b'
                    let fw = 400
                    if (over) {
                      const a = Math.round(overIntensity * 180).toString(16).padStart(2, '0')
                      bg = `${POS_COLOR[pos].fill}${a}`
                      color = overIntensity > 0.4 ? '#f1f5f9' : '#e2e8f0'
                      fw = overIntensity > 0.4 ? 700 : 600
                    } else if (under) {
                      const a = Math.round(underIntensity * 110).toString(16).padStart(2, '0')
                      bg = `#64748b${a}`
                      color = '#94a3b8'
                      fw = 500
                    } else if (count === 0) {
                      color = '#334155'
                    } else {
                      color = '#64748b'
                    }

                    return (
                      <td key={r}
                        title={`Rd ${r} ${pos}: ${count} picks (${pct}%) · ${ratio.toFixed(2)}× your avg`}
                        style={{
                          padding: '4px 3px',
                          background: bg,
                          color,
                          fontWeight: fw,
                          cursor: 'default',
                          transition: 'background 0.15s',
                        }}>
                        {count > 0 ? `${ratio.toFixed(1)}×` : <span style={{ color: '#334155' }}>–</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: '#64748b' }}>
          {mixMode === 'share'
            ? `Values show % of picks in that round. Highlighted cells are well above the position's average round share.`
            : `Values are round share ÷ overall average. Position-colored cells = over-indexing in that round, gray cells = under-indexing.`}
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

          {/* Combo frequency table */}
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
              Roster combos (QB · RB · WR · TE)
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#0f172a' }}>
                    {(['QB', 'RB', 'WR', 'TE'] as Position[]).map(pos => (
                      <th key={pos} style={{ padding: '6px 0', textAlign: 'center', fontWeight: 700, color: POS_COLOR[pos].fill, fontSize: 11, width: '12%' }}>
                        {pos}
                      </th>
                    ))}
                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 10, width: '20%' }}>
                      TEAMS
                    </th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: 10, width: '20%' }}>
                      FREQ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rosterCombos.map(({ qb, rb, wr, te, count }, idx) => {
                    const pct = Math.round((count / totalEntries) * 100)
                    const isTop = idx === 0
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid #1e293b', background: isTop ? '#1e29381a' : undefined }}>
                        <td style={{ padding: '7px 0', textAlign: 'center', color: POS_COLOR.QB.fill, fontWeight: 700 }}>{qb}</td>
                        <td style={{ padding: '7px 0', textAlign: 'center', color: POS_COLOR.RB.fill, fontWeight: 700 }}>{rb}</td>
                        <td style={{ padding: '7px 0', textAlign: 'center', color: POS_COLOR.WR.fill, fontWeight: 700 }}>{wr}</td>
                        <td style={{ padding: '7px 0', textAlign: 'center', color: POS_COLOR.TE.fill, fontWeight: 700 }}>{te}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#e2e8f0', fontWeight: isTop ? 700 : 500 }}>
                          {count}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <div className="flex items-center justify-end gap-2">
                            <div style={{ width: 40, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#7c3aed', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: isTop ? '#e2e8f0' : '#64748b', fontWeight: isTop ? 600 : 400, minWidth: 28, textAlign: 'right' }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
                        {Math.round(actual)}% <span style={{ color: '#64748b' }}>actual</span>
                        &nbsp;·&nbsp;
                        {target}% <span style={{ color: '#64748b' }}>target</span>
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
            <p className="text-xs pt-1" style={{ color: '#64748b' }}>
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
          Positional share per draft phase vs. your overall average. Badge shows how much each position is over or under your portfolio norm in that window.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {phases.map(phase => (
            <div key={phase.label} className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
              <div className="text-xs font-semibold mb-3" style={{ color: '#94a3b8' }}>{phase.label}</div>
              <div className="space-y-3">
                {POSITIONS.map(pos => {
                  const count  = phase.counts[pos]
                  const pct    = phase.pct[pos]
                  const avg    = overallSplit[pos]        // portfolio-wide % for this position
                  const ratio  = avg > 0 ? pct / avg : 0
                  const dev    = pct - avg                // percentage-point deviation
                  const absDev = Math.abs(dev)
                  const isOver  = dev > 2
                  const isUnder = dev < -2

                  // Bar width: proportion relative to max in this phase
                  const maxPct   = Math.max(...POSITIONS.map(p => phase.pct[p]))
                  const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
                  // Bar color: position color when over, muted slate when under
                  const barColor = isOver ? POS_COLOR[pos].fill : isUnder ? '#475569' : POS_COLOR[pos].fill

                  // Badge
                  const badgeLabel = absDev < 2
                    ? 'avg'
                    : isOver
                      ? `+${Math.round(dev)}pp`
                      : `${Math.round(dev)}pp`
                  const badgeColor = absDev < 2
                    ? '#64748b'
                    : isOver
                      ? POS_COLOR[pos].fill
                      : '#94a3b8'
                  const badgeBg = absDev < 2
                    ? '#1e293b50'
                    : isOver
                      ? `${POS_COLOR[pos].fill}22`
                      : '#1e293b50'

                  return (
                    <div key={pos}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].fill }}>{pos}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px',
                            borderRadius: 3, letterSpacing: '0.03em',
                            color: badgeColor, background: badgeBg,
                            border: `1px solid ${badgeColor}40`,
                          }}>
                            {badgeLabel}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          {count} · {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
                        {/* Portfolio average marker */}
                        {avg > 0 && maxPct > 0 && (
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0, width: 2,
                            left: `${(avg / maxPct) * 100}%`,
                            background: '#334155',
                            zIndex: 1,
                          }} />
                        )}
                        {/* Actual fill */}
                        <div style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          background: barColor,
                          opacity: isUnder ? 0.4 : 0.75,
                          borderRadius: 9999,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: '#64748b' }}>{phase.total} picks</span>
                <span className="text-xs" style={{ color: '#64748b' }}>tick = your avg</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── 6. Portfolio Score Distributions ── */}
      {scoreStats && (
        <section>
          <h2 className="section-header mb-1">Portfolio Score Distributions</h2>
          <p className="text-xs mb-5" style={{ color: '#64748b' }}>
            Range of positional probabilities and ceiling scores across all {totalEntries} teams — shows how consistent vs. variable each metric is in your portfolio.
          </p>

          {/* Metric range rows */}
          <div className="space-y-4">
            {([
              { key: 'pQB',   label: 'QB',     sublabel: 'P(group ≥ 11 usable wks)', color: POS_COLOR.QB.fill },
              { key: 'pRB',   label: 'RB',     sublabel: 'P(group ≥ 30 usable wks)', color: POS_COLOR.RB.fill },
              { key: 'pWR',   label: 'WR',     sublabel: 'P(group ≥ 40 usable wks)', color: POS_COLOR.WR.fill },
              { key: 'pTE',   label: 'TE',     sublabel: 'P(group ≥ 10 usable wks)', color: POS_COLOR.TE.fill },
              { key: 'pCeil', label: 'Lineup', sublabel: 'P(≥ 160 pts ceiling)',      color: '#7c3aed'         },
            ] as { key: keyof typeof scoreStats; label: string; sublabel: string; color: string }[]).map(({ key, label, sublabel, color }) => {
              const s = scoreStats[key]
              const fmt = (v: number) => `${Math.round(v * 100)}%`
              // Positions in 0–100% space
              const minX  = s.min  * 100
              const p25X  = s.p25  * 100
              const medX  = s.med  * 100
              const avgX  = s.avg  * 100
              const p75X  = s.p75  * 100
              const maxX  = s.max  * 100
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color }}>{label}</span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{sublabel}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: '#94a3b8' }}>
                      <span>min <strong style={{ color: '#cbd5e1' }}>{fmt(s.min)}</strong></span>
                      <span>avg <strong style={{ color: '#f1f5f9' }}>{fmt(s.avg)}</strong></span>
                      <span>med <strong style={{ color: '#cbd5e1' }}>{fmt(s.med)}</strong></span>
                      <span>max <strong style={{ color: '#cbd5e1' }}>{fmt(s.max)}</strong></span>
                    </div>
                  </div>
                  {/* Range track */}
                  <div className="relative h-5 rounded" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
                    {/* Min–Max band */}
                    <div style={{
                      position: 'absolute', top: 4, bottom: 4,
                      left: `${minX}%`, width: `${maxX - minX}%`,
                      background: color, opacity: 0.15, borderRadius: 2,
                    }} />
                    {/* IQR band (P25–P75) */}
                    <div style={{
                      position: 'absolute', top: 3, bottom: 3,
                      left: `${p25X}%`, width: `${p75X - p25X}%`,
                      background: color, opacity: 0.35, borderRadius: 2,
                    }} />
                    {/* Median tick */}
                    <div style={{
                      position: 'absolute', top: 2, bottom: 2, width: 2, borderRadius: 1,
                      left: `${medX}%`, background: color, opacity: 0.7,
                    }} />
                    {/* Average marker (filled circle via div) */}
                    <div style={{
                      position: 'absolute', top: '50%', width: 7, height: 7,
                      borderRadius: '50%', background: color,
                      left: `${avgX}%`, transform: 'translate(-50%, -50%)',
                    }} />
                    {/* Avg % label */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center',
                      paddingLeft: 6, pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.03em' }}>
                        avg {fmt(s.avg)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Grade tier distribution */}
          <div className="mt-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
              Team grade distribution
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TIER_STYLE).map(([tier, style]) => {
                const count = tierCounts[tier] ?? 0
                if (count === 0) return null
                return (
                  <div key={tier} className="flex items-center gap-1.5 rounded px-2 py-1"
                    style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: style.text, letterSpacing: '0.04em' }}>{tier}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: style.text }}>{count}</span>
                    <span style={{ fontSize: 10, color: style.text, opacity: 0.6 }}>
                      ({Math.round((count / totalEntries) * 100)}%)
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <Divider />

      {/* ── 7. Portfolio Variability & Clustering ── */}
      <section>
        <h2 className="section-header mb-1">Portfolio Variability &amp; Clustering</h2>
        <p className="text-xs mb-5" style={{ color: '#64748b' }}>
          How concentrated or spread your picks are at each position, and which players consistently appear together across your teams.
        </p>

        {/* ── Player Exposure Distribution ── */}
        <div className="mb-8">
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
            Player exposure distribution
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {POSITIONS.map(pos => {
              const players = playerDist.byPos[pos]
              const totalPicksAtPos = players.reduce((s, p) => s + p.count, 0)
              const flatPct = players.length > 0 ? 100 / players.length : 0
              const singlePct = 100 / totalEntries  // exposure from one appearance
              const top3Share = players.slice(0, 3).reduce((s, p) => s + p.count, 0) / Math.max(totalPicksAtPos, 1)
              const shown = players.slice(0, 8)

              return (
                <div key={pos} className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: POS_COLOR[pos].fill }}>{pos}</span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{players.length} unique</span>
                    </div>
                    <span className="text-xs" style={{ color: '#64748b' }}>
                      top 3: <strong style={{ color: '#94a3b8' }}>{Math.round(top3Share * 100)}%</strong> of {pos} picks
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {shown.map(p => (
                      <div key={p.name}>
                        <div className="flex items-center justify-between mb-0.5">
                          <button
                            onClick={() => setFocusedPlayer(focusedPlayer === p.name ? null : p.name)}
                            className="text-left hover:underline"
                            style={{ fontSize: 11, color: focusedPlayer === p.name ? POS_COLOR[pos].fill : '#cbd5e1', fontWeight: focusedPlayer === p.name ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            {p.name}
                          </button>
                          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', marginLeft: 6 }}>
                            {p.count}/{totalEntries} · {Math.round(p.pct)}%
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full overflow-visible" style={{ background: '#1e293b' }}>
                          {/* Flat-distribution reference tick */}
                          <div style={{
                            position: 'absolute', top: -1, bottom: -1, width: 1.5,
                            left: `${Math.min(flatPct, 100)}%`, background: '#334155', borderRadius: 1,
                          }} />
                          {/* Single-appearance reference tick */}
                          {Math.abs(singlePct - flatPct) > 3 && (
                            <div style={{
                              position: 'absolute', top: -1, bottom: -1, width: 1.5,
                              left: `${Math.min(singlePct, 100)}%`, background: '#1e293b', borderRadius: 1,
                            }} />
                          )}
                          {/* Actual bar */}
                          <div style={{
                            height: '100%', width: `${Math.min(p.pct, 100)}%`,
                            background: POS_COLOR[pos].fill,
                            opacity: 0.75, borderRadius: 9999,
                          }} />
                        </div>
                      </div>
                    ))}
                    {players.length > 8 && (
                      <div style={{ fontSize: 10, color: '#475569', paddingTop: 2 }}>
                        +{players.length - 8} more at ≤{Math.round(players[8]?.pct ?? 0)}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-3" style={{ fontSize: 9, color: '#475569' }}>
                    <span>
                      <span style={{ display: 'inline-block', width: 8, height: 2, background: '#334155', verticalAlign: 'middle', marginRight: 3 }} />
                      flat ({Math.round(flatPct)}%)
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: '#475569' }}>
            Tick mark = flat distribution ({'{'}100% ÷ unique players{'}'}). Click a player name to see their co-draft companions below.
          </p>
        </div>

        {/* ── Player Co-Clustering ── */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
              {focusedPlayer ? `Companions · ${focusedPlayer}` : 'Player co-clustering'}
            </div>
            {focusedPlayer && (
              <button
                onClick={() => setFocusedPlayer(null)}
                style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ← All pairs
              </button>
            )}
          </div>

          {focusedPlayer ? (
            /* Drill-down: all companions for the focused player */
            (() => {
              const info = playerDist.infoMap[focusedPlayer]
              const companions = Object.entries(coMatrix[focusedPlayer] ?? {})
                .map(([bName, coCount]) => {
                  const bInfo = playerDist.infoMap[bName]
                  return bInfo ? { bInfo, coCount, cond: coCount / (info?.count ?? 1) } : null
                })
                .filter((x): x is NonNullable<typeof x> => x !== null)
                .sort((a, b) => b.cond - a.cond)

              return (
                <div>
                  <div className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                    <span style={{ color: POS_COLOR[info?.pos ?? 'QB'].fill, fontWeight: 700 }}>{focusedPlayer}</span>
                    &nbsp;· {info?.count ?? 0}/{totalEntries} teams ({Math.round(info?.pct ?? 0)}% exposure)
                    &nbsp;· showing all {companions.length} co-drafted players
                  </div>
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#0f172a' }}>
                          <th style={{ padding: '6px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10 }}>COMPANION</th>
                          <th style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>THEIR EXP</th>
                          <th style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>TOGETHER</th>
                          <th style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b', fontWeight: 600, fontSize: 10 }}>
                            OF {focusedPlayer.split(' ').pop()?.toUpperCase()}&apos;S TEAMS
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {companions.slice(0, 20).map(({ bInfo, coCount, cond }, idx) => (
                          <tr key={bInfo.name} style={{ borderTop: '1px solid #1e293b', background: idx % 2 === 1 ? '#0f172a40' : undefined }}>
                            <td style={{ padding: '6px 12px' }}>
                              <div className="flex items-center gap-2">
                                <span style={{ fontSize: 9, fontWeight: 700, color: POS_COLOR[bInfo.pos].fill, background: `${POS_COLOR[bInfo.pos].fill}20`, padding: '1px 4px', borderRadius: 2 }}>{bInfo.pos}</span>
                                <button onClick={() => setFocusedPlayer(bInfo.name)}
                                  style={{ fontSize: 12, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                                  {bInfo.name}
                                </button>
                              </div>
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                              {bInfo.count}/{totalEntries} · {Math.round(bInfo.pct)}%
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'center', color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>{coCount}</td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                              <div className="flex items-center justify-end gap-2">
                                <div style={{ width: 40, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${cond * 100}%`, background: POS_COLOR[bInfo.pos].fill, opacity: 0.7 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: cond >= 0.75 ? '#f1f5f9' : '#94a3b8', minWidth: 36, textAlign: 'right' }}>
                                  {Math.round(cond * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()
          ) : (
            /* Overview: notable pairs */
            notablePairs.length === 0 ? (
              <p className="text-xs" style={{ color: '#475569' }}>
                Not enough co-appearances to surface notable pairs (need at least 2 teams with each player).
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#0f172a' }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10 }}>PLAYER A</th>
                      <th style={{ padding: '6px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 10 }}>PLAYER B</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>TOGETHER</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>P(B|A)</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 10 }}>P(A|B)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notablePairs.slice(0, 20).map(({ a, b, coCount, condA, condB }, idx) => (
                      <tr key={`${a.name}|${b.name}`} style={{ borderTop: '1px solid #1e293b', background: idx % 2 === 1 ? '#0f172a40' : undefined }}>
                        <td style={{ padding: '7px 12px' }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 9, fontWeight: 700, color: POS_COLOR[a.pos].fill, background: `${POS_COLOR[a.pos].fill}20`, padding: '1px 4px', borderRadius: 2 }}>{a.pos}</span>
                            <button onClick={() => setFocusedPlayer(a.name)}
                              style={{ fontSize: 12, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                              {a.name}
                            </button>
                            <span style={{ fontSize: 10, color: '#64748b' }}>{Math.round(a.pct)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <div className="flex items-center gap-1.5">
                            <span style={{ fontSize: 9, fontWeight: 700, color: POS_COLOR[b.pos].fill, background: `${POS_COLOR[b.pos].fill}20`, padding: '1px 4px', borderRadius: 2 }}>{b.pos}</span>
                            <button onClick={() => setFocusedPlayer(b.name)}
                              style={{ fontSize: 12, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                              {b.name}
                            </button>
                            <span style={{ fontSize: 10, color: '#64748b' }}>{Math.round(b.pct)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{coCount}/{totalEntries}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <CondBadge value={condA} />
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <CondBadge value={condB} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-xs" style={{ background: '#0f172a', color: '#475569', borderTop: '1px solid #1e293b' }}>
                  P(B|A) = % of Player A&apos;s teams that also have Player B. Click any player name to see their full companion profile.
                  {notablePairs.length > 20 && ` Showing 20 of ${notablePairs.length} pairs.`}
                </div>
              </div>
            )
          )}
        </div>
      </section>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CondBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.9 ? '#f87171' : value >= 0.7 ? '#fb923c' : value >= 0.5 ? '#fbbf24' : '#64748b'
  return (
    <span style={{
      display: 'inline-block', minWidth: 36, fontSize: 11, fontWeight: 700,
      color, padding: '1px 6px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}30`,
    }}>
      {pct}%
    </span>
  )
}

function Divider() {
  return <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
}

function ModeToggle({ mode, onChange }: { mode: MixMode; onChange: (m: MixMode) => void }) {
  const opts: { key: MixMode; label: string }[] = [
    { key: 'share',    label: 'Share %' },
    { key: 'relative', label: 'vs. Avg' },
  ]
  return (
    <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-light)' }}>
      {opts.map(({ key, label }) => {
        const active = mode === key
        return (
          <button key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
              background: active ? '#7c3aed' : 'var(--navy-800)',
              color: active ? '#ffffff' : '#64748b',
              borderLeft: '1px solid var(--border-light)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

interface RelativeChartProps {
  rounds: number
  proportions: Record<number, Record<Position, number>>
  avgProp: Record<Position, number>
  roundMix: Record<number, Record<Position, number>>
}

/**
 * Diverging small-multiples chart: one row per position.
 * Each row shows a bar per round representing (actual share ÷ overall average).
 * Baseline at 1.0× runs through the vertical center of each row.
 * Bars grow upward from baseline (over-indexing, position color) or
 * downward (under-indexing, muted slate).
 */
function RelativeChart({ rounds, proportions, avgProp, roundMix }: RelativeChartProps) {
  const ROW_H   = 58           // plot area height per position
  const ROW_GAP = 18
  const BAR_W   = 22
  const GAP     = 4
  const PAD_L   = 58
  const PAD_T   = 8
  const AXIS_H  = 18
  const MAX_DEV = 1.5          // ratio deviation at which bars hit the rail (2.5× or 0× from 1.0)
  const svgW    = PAD_L + rounds * (BAR_W + GAP) + 6
  const svgH    = PAD_T + POSITIONS.length * (ROW_H + ROW_GAP) + AXIS_H

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={svgH} style={{ display: 'block', minWidth: svgW }}>
        {POSITIONS.map((pos, posIdx) => {
          const avg = avgProp[pos]
          const rowTop  = PAD_T + posIdx * (ROW_H + ROW_GAP)
          const baseY   = rowTop + ROW_H / 2  // 1.0× baseline
          const halfH   = ROW_H / 2

          return (
            <g key={pos}>
              {/* Row background band */}
              <rect x={PAD_L} y={rowTop} width={rounds * (BAR_W + GAP)} height={ROW_H}
                fill="#0f172a" opacity={0.4} rx={3} />

              {/* Position label + avg */}
              <text x={PAD_L - 10} y={baseY - 3} textAnchor="end" fontSize={12} fontWeight={700} fill={POS_COLOR[pos].fill}>
                {pos}
              </text>
              <text x={PAD_L - 10} y={baseY + 11} textAnchor="end" fontSize={9} fill="#64748b">
                avg {Math.round(avg * 100)}%
              </text>

              {/* Horizontal rail at 1.0× (baseline) */}
              <line x1={PAD_L - 4} x2={PAD_L + rounds * (BAR_W + GAP)} y1={baseY} y2={baseY}
                stroke="#475569" strokeWidth={1} />
              <text x={PAD_L - 4} y={baseY - 2} textAnchor="start" fontSize={8} fill="#64748b">1.0×</text>

              {/* Faint quarter rails at 2× and 0.5× */}
              <line x1={PAD_L} x2={PAD_L + rounds * (BAR_W + GAP)}
                y1={baseY - halfH * (1 / MAX_DEV)} y2={baseY - halfH * (1 / MAX_DEV)}
                stroke="#1e293b" strokeWidth={1} strokeDasharray="2 3" />
              <line x1={PAD_L} x2={PAD_L + rounds * (BAR_W + GAP)}
                y1={baseY + halfH * (0.5 / MAX_DEV)} y2={baseY + halfH * (0.5 / MAX_DEV)}
                stroke="#1e293b" strokeWidth={1} strokeDasharray="2 3" />

              {/* Bars */}
              {Array.from({ length: rounds }, (_, i) => {
                const r     = i + 1
                const x     = PAD_L + i * (BAR_W + GAP)
                const prop  = proportions[r]?.[pos] ?? 0
                const count = roundMix[r]?.[pos] ?? 0
                const ratio = avg > 0 ? prop / avg : 0
                const dev   = ratio - 1
                const clamped = Math.max(-MAX_DEV, Math.min(MAX_DEV, dev))
                const barH  = (Math.abs(clamped) / MAX_DEV) * halfH
                const above = dev >= 0
                const barY  = above ? baseY - barH : baseY
                const fill  = above ? POS_COLOR[pos].fill : '#64748b'
                const opacity = above
                  ? 0.55 + 0.35 * Math.min(clamped / MAX_DEV, 1)
                  : 0.35 + 0.30 * Math.min(Math.abs(clamped) / MAX_DEV, 1)

                return (
                  <g key={r}>
                    {count > 0 ? (
                      <rect x={x} y={barY} width={BAR_W} height={Math.max(barH, 1)}
                        fill={fill} opacity={opacity} rx={1.5}>
                        <title>
                          {`Rd ${r} ${pos}: ${count} picks · ${Math.round(prop * 100)}% of round (${ratio.toFixed(2)}× your avg)`}
                        </title>
                      </rect>
                    ) : (
                      <circle cx={x + BAR_W / 2} cy={baseY} r={1.5} fill="#475569">
                        <title>{`Rd ${r} ${pos}: 0 picks`}</title>
                      </circle>
                    )}
                  </g>
                )
              })}

              {/* Round labels on the last row only */}
              {posIdx === POSITIONS.length - 1 && Array.from({ length: rounds }, (_, i) => {
                const r = i + 1
                const x = PAD_L + i * (BAR_W + GAP) + BAR_W / 2
                return (
                  <text key={r} x={x} y={rowTop + ROW_H + ROW_GAP - 4} textAnchor="middle" fontSize={9} fill="#64748b">
                    {r}
                  </text>
                )
              })}
            </g>
          )
        })}

        {/* Axis label */}
        <text x={PAD_L + (rounds * (BAR_W + GAP)) / 2} y={svgH - 2} textAnchor="middle" fontSize={9} fill="#64748b">
          Round
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 flex-wrap items-center">
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 8, background: '#34d399', opacity: 0.8, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>above 1.0× = over-indexing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div style={{ width: 10, height: 8, background: '#64748b', opacity: 0.55, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>below 1.0× = under-indexing</span>
        </div>
      </div>
    </div>
  )
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
