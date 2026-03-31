'use client'

import { DraftEntry, Pick, Position } from '@/lib/types'
import { PlayerPrediction, PredSplit } from '@/hooks/usePredictions'
import { getAVRate, gradeRate, exceedProb, pickToRound, POSITIONAL_BENCHMARKS } from '@/lib/roundBenchmarks'

interface Props {
  entry: DraftEntry
  getPred: (fullName: string) => PlayerPrediction | undefined
  activeSplit: PredSplit
}

// Position accent colors
const POS_COLORS: Record<string, { bg: string; text: string; border: string; dim: string }> = {
  QB: { bg: '#1a0f0f', text: '#f87171', border: '#7f1d1d', dim: '#991b1b' },
  RB: { bg: '#0f1a0f', text: '#4ade80', border: '#14532d', dim: '#166534' },
  WR: { bg: '#0f1020', text: '#60a5fa', border: '#1e3a5f', dim: '#1d4ed8' },
  TE: { bg: '#1a150a', text: '#fbbf24', border: '#78350f', dim: '#92400e' },
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

export default function TeamDetail({ entry, getPred, activeSplit }: Props) {
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.01em' }}>{entry.label}</h3>
        <p style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{entry.picks.length} picks</p>
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

            return (
              <div key={pos} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: '10px 10px 8px' }}>
                {/* Pos + count */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: c.text, letterSpacing: '0.04em' }}>{pos}</span>
                  <span style={{ fontSize: 10, color: c.dim, fontWeight: 700 }}>{count}×</span>
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
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 10, color: '#1e293b', marginTop: 5 }}>
          Grade &amp; P(↑) based on Median Rate · σ = √Σσᵢ² · benchmarks QB {POSITIONAL_BENCHMARKS.QB} / RB {POSITIONAL_BENCHMARKS.RB} / WR {POSITIONAL_BENCHMARKS.WR} / TE {POSITIONAL_BENCHMARKS.TE}
        </p>
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
        <div className="section-header mb-2">Full Roster</div>
        <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--navy-800)', borderBottom: '1px solid var(--border)' }}>
                  {['#','PLAYER','POS','NFL','RD','RATE','AVG(BENCH)','GRADE','P(↑)','AVG','MAX'].map((h, i) => (
                    <th key={i} style={{
                      padding: '7px 10px',
                      textAlign: i >= 5 ? 'right' : i === 3 || i === 4 ? 'center' : 'left',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                      color: i >= 5 ? '#475569' : '#334155',
                      whiteSpace: 'nowrap',
                      borderRight: (i === 4 || i === 8) ? '1px solid var(--border)' : undefined,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entry.picks.map((pick, i) => {
                  const predEntry = getPred(pick.player.fullName)
                  const pred      = predEntry?.[activeSplit]
                  const round     = pickToRound(pick.pickNumber)
                  const avRate    = getAVRate(pick.player.position, pick.pickNumber)
                  const grading   = pred && avRate !== null ? gradeRate(pred.predRate, avRate) : null
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
