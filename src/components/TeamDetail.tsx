'use client'

import { useState, useMemo } from 'react'
import { DraftEntry, Pick, Position } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'
import { getAVRate, gradeRate, exceedProb, pickToRound, POSITIONAL_BENCHMARKS, roundPercentile } from '@/lib/roundBenchmarks'
import { simulateBestBall } from '@/lib/simulateBestBall'
import { TeamScore } from '@/hooks/useTeamScores'
import { Tier } from '@/lib/scoreTeam'

interface Props {
  entry: DraftEntry
  getPred: (fullName: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
  teamScore?: TeamScore
}

// Position accent colors
const POS_COLORS: Record<string, { bg: string; text: string; border: string; dim: string }> = {
  QB: { bg: '#1a0f0f', text: '#f87171', border: '#7f1d1d', dim: '#991b1b' },
  RB: { bg: '#0f1a0f', text: '#4ade80', border: '#14532d', dim: '#166534' },
  WR: { bg: '#0f1020', text: '#60a5fa', border: '#1e3a5f', dim: '#1d4ed8' },
  TE: { bg: '#1a150a', text: '#fbbf24', border: '#78350f', dim: '#92400e' },
}

const TIER_STYLE: Record<Tier, { text: string; bg: string; border: string }> = {
  S: { text: '#fbbf24', bg: '#422006', border: '#fbbf2440' },
  A: { text: '#34d399', bg: '#052e16', border: '#34d39940' },
  B: { text: '#a3e635', bg: '#1a2e05', border: '#a3e63540' },
  C: { text: '#fbbf24', bg: '#451a03', border: '#fbbf2440' },
  D: { text: '#fb923c', bg: '#431407', border: '#fb923c40' },
  F: { text: '#f87171', bg: '#450a0a', border: '#f8717140' },
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

const STACK_PALETTE = [
  { bg: '#130d1f', border: '#4c1d95', accent: '#8b5cf6' },
  { bg: '#0d1a1a', border: '#134e4a', accent: '#14b8a6' },
  { bg: '#1a0f0a', border: '#7c2d12', accent: '#fb923c' },
  { bg: '#1a0d1a', border: '#701a75', accent: '#e879f9' },
  { bg: '#0d1a18', border: '#064e3b', accent: '#34d399' },
]

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10b981', A: '#22c55e', B: '#84cc16', C: '#f59e0b', D: '#f97316', F: '#ef4444',
}
const GRADE_BG: Record<string, string> = {
  'A+': '#052e16', A: '#052e16', B: '#1a2e05', C: '#451a03', D: '#431407', F: '#450a0a',
}

const SPLIT_COLOR: Record<PredSplit, string> = { C: '#fcd34d', M: '#6ee7b7', F: '#7dd3fc' }

function ProbBadge({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100)
  const color = pct >= 70 ? '#10b981' : pct >= 55 ? '#84cc16' : pct >= 40 ? '#f59e0b' : '#ef4444'
  const bg    = pct >= 70 ? '#052e16' : pct >= 55 ? '#1a2e05' : pct >= 40 ? '#451a03' : '#450a0a'
  return (
    <span style={{ background: bg, color, border: `1px solid ${color}40`, borderRadius: 3, fontSize: 10, fontWeight: 800, padding: '1px 5px', letterSpacing: '0.02em' }}>
      {pct}%
    </span>
  )
}

function GradeBadge({ grade }: { grade: string }) {
  const color = GRADE_COLORS[grade] ?? '#94a3b8'
  const bg    = GRADE_BG[grade]    ?? '#1e293b'
  return (
    <span style={{ background: bg, color, border: `1px solid ${color}40`, borderRadius: 3, fontSize: 11, fontWeight: 800, padding: '1px 6px', letterSpacing: '0.02em', minWidth: 24, display: 'inline-block', textAlign: 'center' }}>
      {grade}
    </span>
  )
}

export default function TeamDetail({ entry, getPred, activeSplit, teamScore }: Props) {
  const [posFilter, setPosFilter] = useState<Position | null>(null)

  function togglePosFilter(pos: Position) {
    setPosFilter(prev => prev === pos ? null : pos)
  }

  // Stacks
  const stackMap = new Map<string, Pick[]>()
  for (const pick of entry.picks) {
    const t = pick.player.nflTeam
    if (!t) continue
    if (!stackMap.has(t)) stackMap.set(t, [])
    stackMap.get(t)!.push(pick)
  }
  const stacks = Array.from(stackMap.entries())
    .filter(([, p]) => p.length >= 2)
    .sort(([, a], [, b]) => b.length - a.length)
  const stackedTeams = new Set(stacks.map(([t]) => t))

  // Positional summary
  const posSummary: Record<Position, { count: number; totalRate: number; totalMedianRate: number; sumSdSq: number }> = {
    QB: { count: 0, totalRate: 0, totalMedianRate: 0, sumSdSq: 0 },
    RB: { count: 0, totalRate: 0, totalMedianRate: 0, sumSdSq: 0 },
    WR: { count: 0, totalRate: 0, totalMedianRate: 0, sumSdSq: 0 },
    TE: { count: 0, totalRate: 0, totalMedianRate: 0, sumSdSq: 0 },
  }
  for (const pick of entry.picks) {
    const pos = pick.player.position
    const pred = getPred(pick.player.fullName)
    posSummary[pos].count += 1
    const sd = pred?.[activeSplit]
    if (sd) posSummary[pos].totalRate += sd.predRate
    const med = pred?.M
    if (med) posSummary[pos].totalMedianRate += med.predRate
    const sigma = pred?.stdDev ?? 0
    posSummary[pos].sumSdSq += sigma * sigma
  }

  const sc = SPLIT_COLOR[activeSplit]

  const THRESHOLD = 160
  const sim = useMemo(
    () => simulateBestBall(entry.picks, getPred, THRESHOLD),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry.picks, getPred],
  )

  const probPct    = Math.round(sim.probability * 100)
  const probColor  = probPct >= 30 ? '#10b981' : probPct >= 15 ? '#84cc16' : probPct >= 7 ? '#f59e0b' : '#ef4444'
  const probBg     = probPct >= 30 ? '#052e16' : probPct >= 15 ? '#1a2e05' : probPct >= 7 ? '#451a03' : '#450a0a'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>{entry.label}</h3>
            <p style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{entry.picks.length} picks</p>
          </div>
          {teamScore && (() => {
            const ts = TIER_STYLE[teamScore.tier]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span style={{
                  fontSize: 20, fontWeight: 900, color: ts.text,
                  background: ts.bg, border: `1px solid ${ts.border}`,
                  borderRadius: 6, padding: '2px 14px', letterSpacing: '0.04em',
                }}>
                  {teamScore.tier}
                </span>
                <span style={{ fontSize: 10, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                  {ordinal(teamScore.percentile)} of {/* total computed externally */}
                  <span style={{ color: ts.text, fontWeight: 700 }}> {teamScore.percentile}</span>
                  <span style={{ color: '#334155' }}>/100</span>
                </span>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Positional cards */}
      <div>
        <div className="section-header mb-2">Positional Grades</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {(['QB', 'RB', 'WR', 'TE'] as Position[]).map(pos => {
            const { count, totalRate, totalMedianRate, sumSdSq } = posSummary[pos]
            const posSD = Math.sqrt(sumSdSq)
            const benchmark = POSITIONAL_BENCHMARKS[pos]
            const grading = totalMedianRate > 0 ? gradeRate(totalMedianRate, benchmark) : null
            const prob = totalMedianRate > 0 && posSD > 0
              ? exceedProb(totalMedianRate, posSD, benchmark)
              : totalMedianRate > benchmark ? 1 : totalMedianRate > 0 ? 0 : null
            const c = POS_COLORS[pos]

            const isActive = posFilter === pos
            return (
              <button
                key={pos}
                onClick={() => togglePosFilter(pos)}
                title={isActive ? 'Click to show all' : `Filter roster to ${pos}`}
                style={{
                  background: c.bg,
                  border: `1px solid ${isActive ? c.text : c.border}`,
                  borderRadius: 6,
                  padding: '10px 10px 8px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: isActive ? `2px solid ${c.text}40` : 'none',
                  outlineOffset: 1,
                  width: '100%',
                  transition: 'border-color 0.15s, outline 0.15s',
                }}
              >
                {/* Pos + count */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: c.text, letterSpacing: '0.04em' }}>{pos}</span>
                  <span style={{ fontSize: 10, color: isActive ? c.text : c.dim, fontWeight: 700 }}>{isActive ? '▾' : `${count}×`}</span>
                </div>

                {/* Rate (split) */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginBottom: 2 }}>
                    <span>RATE ({activeSplit})</span>
                    <span style={{ color: sc, fontWeight: 700 }}>{totalRate.toFixed(1)}</span>
                  </div>
                  <div style={{ height: 2, background: 'var(--navy-700)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((totalRate / (benchmark * 1.5)) * 100, 100)}%`, background: sc, borderRadius: 1 }} />
                  </div>
                </div>

                {/* Median vs benchmark */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: '#334155' }}>MED vs {benchmark}</span>
                  <span style={{ color: '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{totalMedianRate.toFixed(1)}</span>
                </div>

                {/* σ */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 8 }}>
                  <span style={{ color: '#334155' }}>σ</span>
                  <span style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{posSD.toFixed(2)}</span>
                </div>

                {/* Grade + prob */}
                {grading && prob !== null ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${c.border}` }}>
                    <GradeBadge grade={grading.grade} />
                    <ProbBadge prob={prob} />
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: 10, color: '#1e293b', paddingTop: 6, borderTop: `1px solid ${c.border}` }}>
                    no data
                  </div>
                )}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 10, color: '#1e293b', marginTop: 5 }}>
          Grade &amp; P(↑) based on Median Rate · σ = √Σσᵢ² · benchmarks QB {POSITIONAL_BENCHMARKS.QB} / RB {POSITIONAL_BENCHMARKS.RB} / WR {POSITIONAL_BENCHMARKS.WR} / TE {POSITIONAL_BENCHMARKS.TE}
        </p>
      </div>

      {/* Weekly score simulation */}
      <div>
        <div className="section-header mb-2">Weekly Ceiling Lineup Projection</div>
        <div style={{ background: 'var(--navy-900)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Top row: prob badge + expected score */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>P(≥{THRESHOLD} pts)</span>
              <span style={{
                fontSize: 22, fontWeight: 900, color: probColor,
                background: probBg, border: `1px solid ${probColor}40`,
                borderRadius: 6, padding: '2px 12px', letterSpacing: '-0.01em',
              }}>
                {probPct}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#334155', fontWeight: 600, letterSpacing: '0.06em' }}>EXP</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{sim.expectedScore.toFixed(1)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#334155', fontWeight: 600, letterSpacing: '0.06em' }}>MED</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{sim.medianScore.toFixed(1)}</div>
              </div>
            </div>
          </div>

          {/* Distribution bar */}
          <div>
            <div style={{ position: 'relative', height: 22, borderRadius: 4, background: 'var(--navy-800)', overflow: 'visible' }}>
              {/* filled range P10→P90 */}
              {(() => {
                const scale = 240  // display range: 0–240 pts
                const p10x  = Math.min((sim.p10  / scale) * 100, 100)
                const p90x  = Math.min((sim.p90  / scale) * 100, 100)
                const p25x  = Math.min((sim.p25  / scale) * 100, 100)
                const p75x  = Math.min((sim.p75  / scale) * 100, 100)
                const medx  = Math.min((sim.medianScore / scale) * 100, 100)
                const thx   = Math.min((THRESHOLD / scale) * 100, 100)
                return (
                  <>
                    {/* P10-P90 light band */}
                    <div style={{ position: 'absolute', top: 4, bottom: 4, left: `${p10x}%`, width: `${p90x - p10x}%`, background: '#1e293b', borderRadius: 3 }} />
                    {/* P25-P75 band */}
                    <div style={{ position: 'absolute', top: 2, bottom: 2, left: `${p25x}%`, width: `${p75x - p25x}%`, background: '#334155', borderRadius: 3 }} />
                    {/* Median tick */}
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${medx}%`, width: 2, background: '#94a3b8', borderRadius: 1 }} />
                    {/* Threshold line */}
                    <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${thx}%`, width: 2, background: probColor, borderRadius: 1, zIndex: 2 }}>
                      <span style={{ position: 'absolute', top: -14, left: -10, fontSize: 9, color: probColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{THRESHOLD}</span>
                    </div>
                  </>
                )
              })()}
            </div>
            {/* Axis labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#334155', marginTop: 3, paddingLeft: 2, paddingRight: 2 }}>
              <span>0</span>
              <span style={{ color: '#475569' }}>P10: {sim.p10.toFixed(0)} · P25: {sim.p25.toFixed(0)} · MED: {sim.medianScore.toFixed(0)} · P75: {sim.p75.toFixed(0)} · P90: {sim.p90.toFixed(0)}</span>
              <span>240</span>
            </div>
          </div>

          <p style={{ fontSize: 10, color: '#1e293b', marginTop: 0 }}>
            50k sims · best ball (1QB+2RB+3WR+1TE+1FLEX) · μ=M.AVG · σ=avg(MAX−AVG) across C/M/F · threshold {THRESHOLD} pts
          </p>
        </div>
      </div>

      {/* Stacks */}
      {stacks.length > 0 && (
        <div>
          <div className="section-header mb-2">Team Stacks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stacks.map(([team, picks], si) => {
              const pal = STACK_PALETTE[si % STACK_PALETTE.length]
              return (
                <div key={team} style={{ background: pal.bg, border: `1px solid ${pal.border}`, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, color: pal.accent, fontSize: 12, letterSpacing: '0.04em' }}>{team}</span>
                    <span style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{picks.length}-STACK</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {picks.map(pick => {
                      const pred = getPred(pick.player.fullName)?.[activeSplit]
                      const pc = POS_COLORS[pick.player.position]
                      return (
                        <div key={pick.player.appearance} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '3px 7px' }}>
                          <span style={{ fontSize: 9, fontWeight: 800, color: pc.text, letterSpacing: '0.06em' }}>{pick.player.position}</span>
                          <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>{pick.player.fullName}</span>
                          <span style={{ fontSize: 10, color: '#334155' }}>#{pick.pickNumber}</span>
                          {pred && <span style={{ fontSize: 10, color: sc, fontWeight: 700 }}>{pred.predAVG.toFixed(1)}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Roster table */}
      <div>
        <div className="section-header mb-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Full Roster
          {posFilter && (
            <>
              <span style={{ fontSize: 10, color: POS_COLORS[posFilter].text, fontWeight: 700, letterSpacing: '0.06em', background: POS_COLORS[posFilter].bg, border: `1px solid ${POS_COLORS[posFilter].border}`, borderRadius: 3, padding: '1px 6px' }}>
                {posFilter}
              </span>
              <button onClick={() => setPosFilter(null)} style={{ fontSize: 9, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                × clear
              </button>
            </>
          )}
        </div>
        <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy-800)', borderBottom: '1px solid var(--border)' }}>
                  {['#','PLAYER','POS','NFL','RD','RATE','AVG(BENCH)','GRADE','PCTILE','P(↑)','AVG','MAX'].map((h, i) => (
                    <th key={i} style={{
                      padding: '7px 10px',
                      textAlign: i >= 5 ? 'right' : i === 3 || i === 4 ? 'center' : 'left',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                      color: i >= 5 ? '#475569' : '#334155',
                      whiteSpace: 'nowrap',
                      borderRight: (i === 4 || i === 9) ? '1px solid var(--border)' : undefined,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entry.picks.filter(p => !posFilter || p.player.position === posFilter).map((pick, i) => {
                  const predEntry = getPred(pick.player.fullName)
                  const pred      = predEntry?.[activeSplit]
                  const round     = pickToRound(pick.pickNumber)
                  const avRate    = getAVRate(pick.player.position, pick.pickNumber)
                  const grading   = pred && avRate !== null ? gradeRate(pred.predRate, avRate) : null
                  const pctile    = pred && avRate !== null ? roundPercentile(pred.predRate, avRate) : null
                  const medRate   = predEntry?.M?.predRate ?? null
                  const stdDev    = predEntry?.stdDev ?? null
                  const prob      = medRate !== null && stdDev !== null && avRate !== null
                    ? exceedProb(medRate, stdDev, avRate) : null
                  const isStacked = stackedTeams.has(pick.player.nflTeam)
                  const pc        = POS_COLORS[pick.player.position]
                  const rowBg     = isStacked ? 'var(--navy-700)' : i % 2 === 0 ? 'var(--navy-900)' : 'var(--navy-950)'

                  return (
                    <tr key={pick.player.appearance + pick.pickNumber}
                      style={{ background: rowBg, borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--navy-700)')}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      <td style={{ padding: '6px 10px', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{pick.pickNumber}</td>
                      <td style={{ padding: '6px 10px', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {pick.player.fullName}
                        {isStacked && <span style={{ marginLeft: 5, fontSize: 9, color: '#4f46e5', fontWeight: 700, letterSpacing: '0.06em' }}>STACK</span>}
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`, borderRadius: 3, fontSize: 9, fontWeight: 800, padding: '1px 5px', letterSpacing: '0.06em' }}>
                          {pick.player.position}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#475569' }}>{pick.player.nflTeam || '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid var(--border)' }}>{round}</td>

                      {/* Rate + benchmark */}
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {pred
                          ? <span style={{ color: sc, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pred.predRate.toFixed(1)}</span>
                          : <span style={{ color: '#1e293b' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#334155', fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>
                        {avRate !== null ? avRate.toFixed(2) : '—'}
                      </td>

                      {/* Grade */}
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {grading ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            <GradeBadge grade={grading.grade} />
                            <span style={{ fontSize: 9, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                              ({grading.delta >= 0 ? '+' : ''}{grading.delta.toFixed(1)})
                            </span>
                          </div>
                        ) : <span style={{ color: '#1e293b', fontSize: 10 }}>—</span>}
                      </td>

                      {/* Percentile */}
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {pctile !== null ? (() => {
                          const ordinal = (n: number) => {
                            const s = ['th','st','nd','rd']
                            const v = n % 100
                            return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
                          }
                          const color = pctile >= 75 ? '#10b981' : pctile >= 50 ? '#84cc16' : pctile >= 25 ? '#f59e0b' : '#ef4444'
                          return <span style={{ color, fontWeight: 700, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{ordinal(pctile)}</span>
                        })() : <span style={{ color: '#1e293b', fontSize: 10 }}>—</span>}
                      </td>

                      {/* P(↑) */}
                      <td style={{ padding: '6px 10px', textAlign: 'right', borderRight: '1px solid var(--border)' }}>
                        {prob !== null ? <ProbBadge prob={prob} /> : <span style={{ color: '#1e293b', fontSize: 10 }}>—</span>}
                      </td>

                      {/* AVG + Max */}
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: pred ? sc : '#1e293b', fontWeight: pred ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                        {pred ? pred.predAVG.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: pred ? sc : '#1e293b', opacity: pred ? 0.8 : 1, fontVariantNumeric: 'tabular-nums' }}>
                        {pred ? pred.predMax.toFixed(1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 10, color: '#334155' }}>
          <span>Grade vs round avg Rate:</span>
          {Object.entries(GRADE_COLORS).map(([g, c]) => (
            <span key={g} style={{ color: c }}>{g}</span>
          ))}
          <span style={{ marginLeft: 8 }}>P(↑) = P(Rate ≥ round avg) · μ=Median · σ=(C−F)/1.349 · n=17</span>
        </div>
      </div>
    </div>
  )
}
