import { RawRow, Player, Pick, DraftEntry, PlayerExposure, ProcessedData, Filters, Position } from './types'

const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

function toPosition(raw: string): Position {
  const upper = raw.toUpperCase()
  return VALID_POSITIONS.has(upper) ? (upper as Position) : 'WR'
}

function rowToPlayer(row: RawRow): Player {
  const firstName = row['First Name']?.trim() ?? ''
  const lastName = row['Last Name']?.trim() ?? ''
  return {
    appearance: row['Appearance'].trim(),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    nflTeam: row['Team']?.trim() ?? '',
    position: toPosition(row['Position'] ?? ''),
  }
}

export function processRawRows(rows: RawRow[]): ProcessedData {
  // Build entries map: entryId -> picks
  const entriesMap = new Map<string, { draftId: string; tournament: string; picks: Pick[]; firstPickedAt: string }>()

  for (const row of rows) {
    const entryId = row['Draft Entry'].trim()
    const draftId = row['Draft'].trim()
    const tournament = row['Tournament Title']?.trim() ?? ''
    const pickNumber = parseInt(row['Pick Number'], 10)
    const pickedAt = row['Picked At']?.trim() ?? ''

    if (!entriesMap.has(entryId)) {
      entriesMap.set(entryId, { draftId, tournament, picks: [], firstPickedAt: pickedAt })
    }

    const entry = entriesMap.get(entryId)!
    // Track earliest pick date for sorting
    if (pickedAt < entry.firstPickedAt) {
      entry.firstPickedAt = pickedAt
    }

    entry.picks.push({
      player: rowToPlayer(row),
      pickNumber,
      pickedAt,
      draftEntryId: entryId,
      draftId,
      tournament,
    })
  }

  // Sort entries by first pick date, assign labels
  const sortedEntries = Array.from(entriesMap.entries())
    .sort(([, a], [, b]) => a.firstPickedAt.localeCompare(b.firstPickedAt))
    .map(([entryId, data], index): DraftEntry => ({
      entryId,
      draftId: data.draftId,
      tournament: data.tournament,
      picks: data.picks.sort((a, b) => a.pickNumber - b.pickNumber),
      label: `Entry ${index + 1} (${data.tournament})`,
    }))

  const totalEntries = sortedEntries.length

  // Compute player exposures
  const exposures = computeExposures(sortedEntries, totalEntries)

  // Collect unique tournaments and NFL teams
  const tournaments = Array.from(new Set(sortedEntries.map((e) => e.tournament))).filter(Boolean).sort()
  const nflTeams = Array.from(
    new Set(sortedEntries.flatMap((e) => e.picks.map((p) => p.player.nflTeam)))
  )
    .filter(Boolean)
    .sort()

  return { entries: sortedEntries, exposures, totalEntries, tournaments, nflTeams }
}

export function computeExposures(entries: DraftEntry[], totalEntries: number): PlayerExposure[] {
  // Group by appearance UUID
  const playerMap = new Map<string, { player: Player; pickNumbers: number[] }>()

  for (const entry of entries) {
    const seenInEntry = new Set<string>()
    for (const pick of entry.picks) {
      const id = pick.player.appearance
      if (!seenInEntry.has(id)) {
        seenInEntry.add(id)
        if (!playerMap.has(id)) {
          playerMap.set(id, { player: pick.player, pickNumbers: [] })
        }
        playerMap.get(id)!.pickNumbers.push(pick.pickNumber)
      }
    }
  }

  return Array.from(playerMap.values())
    .map(({ player, pickNumbers }): PlayerExposure => ({
      player,
      count: pickNumbers.length,
      exposurePct: totalEntries > 0 ? (pickNumbers.length / totalEntries) * 100 : 0,
      avgPickNumber: pickNumbers.reduce((a, b) => a + b, 0) / pickNumbers.length,
    }))
    .sort((a, b) => b.exposurePct - a.exposurePct)
}

export function applyFilters(data: ProcessedData, filters: Filters): PlayerExposure[] {
  // If tournament filter is active, re-aggregate from filtered entries
  let entries = data.entries
  let totalEntries = data.totalEntries

  if (filters.tournament !== 'ALL') {
    entries = entries.filter((e) => e.tournament === filters.tournament)
    totalEntries = entries.length
  }

  let exposures = computeExposures(entries, totalEntries)

  // Position filter: display-only (denominator unchanged within tournament scope)
  if (filters.position !== 'ALL') {
    exposures = exposures.filter((e) => e.player.position === filters.position)
  }

  // NFL team filter: display-only
  if (filters.nflTeam !== 'ALL') {
    exposures = exposures.filter((e) => e.player.nflTeam === filters.nflTeam)
  }

  return exposures
}
