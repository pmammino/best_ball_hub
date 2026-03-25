// AVRate benchmarks by position and round, sourced from round_data.csv.
// Round = Math.min(Math.ceil(pickNumber / 12), 18)
// QB has no round 1 data (QBs rarely taken round 1).
// All picks in round 18+ use the round 18 benchmark.

const BENCHMARKS: Record<string, Record<number, number>> = {
  QB: {
    2: 5,    3: 9.29, 4: 5.6,  5: 6.57, 6: 6,    7: 4.25,
    8: 4.33, 9: 4.82, 10: 4.36,11: 3.45,12: 2.44,13: 3.25,
    14: 3,   15: 2.2, 16: 2.18,17: 1.79,18: 0.54,
  },
  RB: {
    1: 8.7,  2: 8.22, 3: 7.33, 4: 5.79, 5: 5.2,  6: 4.12,
    7: 5.35, 8: 4.11, 9: 3.7,  10: 3.6, 11: 2.44,12: 1.87,
    13: 2.22,14: 2.94,15: 1.59,16: 1.7, 17: 0.94,18: 0.49,
  },
  TE: {
    1: 11,   2: 4.67, 3: 6.6,  4: 6.2,  5: 6.33, 6: 6.4,
    7: 2.75, 8: 4.38, 9: 3.33, 10: 3.67,11: 2.88,12: 2.57,
    13: 3.18,14: 2.69,15: 1.92,16: 2.19,17: 1.97,18: 0.65,
  },
  WR: {
    1: 9.37, 2: 7.14, 3: 6.6,  4: 5.82, 5: 5.69, 6: 5.06,
    7: 4.78, 8: 3.12, 9: 3.53, 10: 3.14,11: 2.39,12: 3.22,
    13: 2.48,14: 2.29,15: 1.88,16: 1.97,17: 1.29,18: 0.68,
  },
}

/** Returns the round number for a given pick (1-indexed, capped at 18). */
export function pickToRound(pickNumber: number): number {
  return Math.min(Math.ceil(pickNumber / 12), 18)
}

/**
 * Returns the AVRate benchmark for a position + pick number.
 * Returns null if no benchmark exists (e.g. QB in round 1).
 */
export function getAVRate(position: string, pickNumber: number): number | null {
  const round = pickToRound(pickNumber)
  return BENCHMARKS[position]?.[round] ?? null
}

/**
 * Grades a player's predicted Rate vs. the positional round benchmark.
 * Returns the delta (predRate - AVRate) and a letter grade.
 */
export function gradeRate(predRate: number, avRate: number): {
  delta: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  color: string
} {
  const delta = predRate - avRate
  const pct = avRate > 0 ? delta / avRate : 0

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  let color: string

  if (pct >= 0.5) {         grade = 'A+'; color = 'text-emerald-300' }
  else if (pct >= 0.2) {    grade = 'A';  color = 'text-green-400'   }
  else if (pct >= -0.1) {   grade = 'B';  color = 'text-lime-400'    }
  else if (pct >= -0.3) {   grade = 'C';  color = 'text-yellow-400'  }
  else if (pct >= -0.5) {   grade = 'D';  color = 'text-orange-400'  }
  else {                    grade = 'F';  color = 'text-red-400'      }

  return { delta, grade, color }
}
