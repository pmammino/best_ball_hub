import type { PlayerPrediction, SplitPrediction } from '@/hooks/usePredictions'
import { type XGBModel, xgbPredict, buildRateFeatures } from './xgbRate'

// ── Fallback divisors (used when XGB models are not loaded) ────────────────────
const RATE_DIVISOR: Record<string, number> = {
  QB: 52,
  RB: 27,
  WR: 25,
  TE: 28,
}

/** predMax = predAVG × multiplier (position-specific boom/bust factor) */
const MAX_MULT: Record<string, number> = {
  QB: 1.80,
  RB: 2.20,
  WR: 2.30,
  TE: 2.40,
}

interface RawStats {
  passAtt: number; passComp: number; passYards: number; passTD: number; passInt: number
  rushAtt: number; rushYards: number; rushTD: number
  targets: number; receptions: number; recYards: number; recTD: number
  fumblesLost: number
}

function buildSplitPrediction(
  pts: number,
  games: number,
  position: string,
  stats: RawStats,
  models?: Map<string, XGBModel>,
): SplitPrediction {
  const predAVG = pts / games
  const mult = MAX_MULT[position] ?? 2.0
  let predRate: number
  const model = models?.get(position)
  if (model) {
    predRate = xgbPredict(model, buildRateFeatures(games, predAVG, stats))
  } else {
    // Clamp to the same [0, 17] usable-weeks range the model path enforces —
    // noisy floor projections can otherwise push this slightly negative.
    const raw = (games * predAVG) / (RATE_DIVISOR[position] ?? 22)
    predRate = Math.max(0, Math.min(17, raw))
  }
  return { games, predRate, predAVG, predMax: predAVG * mult }
}

// ── RotoWire "NFLceilfloor" XML feed parser ────────────────────────────────────
//
// The feed replaces the old projections.csv. Shape (identical for free agents and
// for players nested under a team):
//
//   <SeasonProjections Season="2026">
//     <FreeAgents>
//       <Player Id="9320">
//         <FirstName>…</FirstName> <LastName>…</LastName> <Position>QB</Position>
//         <Projections        GamesPlayed="…" PassAttempts="…" … />  ← base / median (M)
//         <FloorProjections   GamesPlayed="…" … />                    ← floor (F)
//         <CeilingProjections GamesPlayed="…" … />                    ← ceiling (C)
//       </Player>
//     </FreeAgents>
//     <Teams>
//       <Team Id="1" Code="ARZ"> <Players> <Player Id="…">…</Player> </Players> </Team>
//     </Teams>
//   </SeasonProjections>
//
// Each projection element carries season-total stat attributes for that scenario;
// per-game rates are derived as total / GamesPlayed (same as the old CSV).

/** Parse a numeric XML attribute, tolerating empty/NULL/exponent notation. */
function attr(el: Element, name: string): number {
  const v = el.getAttribute(name)
  if (!v || v === 'NULL') return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function feedStats(el: Element): RawStats {
  return {
    passAtt:     attr(el, 'PassAttempts'),
    passComp:    attr(el, 'PassCompletions'),
    passYards:   attr(el, 'PassYards'),
    passTD:      attr(el, 'PassTouchdowns'),
    passInt:     attr(el, 'PassInterceptions'),
    rushAtt:     attr(el, 'RushAttempts'),
    rushYards:   attr(el, 'RushYards'),
    rushTD:      attr(el, 'RushTouchdowns'),
    targets:     attr(el, 'Targets'),
    receptions:  attr(el, 'Receptions'),
    recYards:    attr(el, 'ReceivingYards'),
    recTD:       attr(el, 'ReceivingTouchdowns'),
    fumblesLost: attr(el, 'FumblesLost'),
  }
}

/** Underdog half-PPR scoring from a feed projection element's stat attributes. */
function feedFantasyPts(el: Element): number {
  return (
    attr(el, 'PassYards') * 0.04 +
    attr(el, 'PassTouchdowns') * 4 -
    attr(el, 'PassInterceptions') * 1 +
    attr(el, 'RushYards') * 0.1 +
    attr(el, 'RushTouchdowns') * 6 +
    attr(el, 'Receptions') * 0.5 +
    attr(el, 'ReceivingYards') * 0.1 +
    attr(el, 'ReceivingTouchdowns') * 6 +
    // Feed exposes a single combined 2-pt total (pass/rush/rec), scored at 2 pts.
    attr(el, 'TwoPointConversions') * 2 -
    attr(el, 'FumblesLost') * 2
  )
}

function childText(player: Element, tag: string): string {
  return player.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

/** Walk up to the enclosing <Team> and return its Code (empty for free agents). */
function enclosingTeamCode(player: Element): string {
  let node: Element | null = player.parentElement
  while (node) {
    if (node.tagName === 'Team') return node.getAttribute('Code')?.trim() ?? ''
    node = node.parentElement
  }
  return ''
}

function buildFeedSplit(
  el: Element | undefined,
  position: string,
  models?: Map<string, XGBModel>,
): SplitPrediction | null {
  if (!el) return null
  const games = attr(el, 'GamesPlayed')
  if (games <= 0) return null
  return buildSplitPrediction(feedFantasyPts(el), games, position, feedStats(el), models)
}

/**
 * Parses the RotoWire ceiling/floor XML feed into a name-keyed prediction map.
 * Pass `models` (from loadXGBModels()) to use XGBoost Rate predictions; omit to
 * fall back to the divisor formula. Runs client-side (uses DOMParser).
 */
export function parseFeedProjections(
  xmlText: string,
  models?: Map<string, XGBModel>,
): Map<string, PlayerPrediction> {
  const predByName = new Map<string, PlayerPrediction>()
  if (typeof DOMParser === 'undefined') return predByName

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not parse the projections feed (invalid XML)')
  }

  for (const player of Array.from(doc.getElementsByTagName('Player'))) {
    const first = childText(player, 'FirstName')
    const last = childText(player, 'LastName')
    const fullName = `${first} ${last}`.trim()
    if (!fullName) continue

    const position = childText(player, 'Position')
    const id = player.getAttribute('Id') ?? ''
    const team = enclosingTeamCode(player)

    // getElementsByTagName is scoped to this player's descendants, so it will
    // not pick up a sibling team's <Projections> defense block.
    const M = buildFeedSplit(player.getElementsByTagName('Projections')[0], position, models)
    if (!M) continue
    const C = buildFeedSplit(player.getElementsByTagName('CeilingProjections')[0], position, models)
    const F = buildFeedSplit(player.getElementsByTagName('FloorProjections')[0], position, models)

    const stdDev =
      C && F ? Math.max((C.predRate - F.predRate) / 1.349, 0) : M.predRate * 0.5

    predByName.set(fullName.toLowerCase(), {
      NFLNewsID: parseInt(id) || 0,
      firstName: first,
      lastName: last,
      fullName,
      position,
      team,
      stdDev,
      C,
      M,
      F,
    })
  }

  return predByName
}
