export interface RawRow {
  'Picked At': string
  'Pick Number': string
  'Appearance': string
  'First Name': string
  'Last Name': string
  'Team': string
  'Position': string
  'Draft': string
  'Draft Entry': string
  'Draft Size': string
  'Tournament Title': string
}

export type Position = 'QB' | 'RB' | 'WR' | 'TE'

export interface Player {
  appearance: string
  firstName: string
  lastName: string
  fullName: string
  nflTeam: string
  position: Position
}

export interface Pick {
  player: Player
  pickNumber: number
  pickedAt: string
  draftEntryId: string
  draftId: string
  tournament: string
}

export interface DraftEntry {
  entryId: string
  draftId: string
  tournament: string
  picks: Pick[]
  label: string
}

export interface PlayerExposure {
  player: Player
  count: number
  exposurePct: number
  avgPickNumber: number
}

export interface ProcessedData {
  entries: DraftEntry[]
  exposures: PlayerExposure[]
  totalEntries: number
  tournaments: string[]
  nflTeams: string[]
}

export type SortField = 'name' | 'position' | 'nflTeam' | 'count' | 'exposurePct' | 'avgPickNumber' | 'predRate' | 'predAVG' | 'predMax'
export type SortDirection = 'asc' | 'desc'

export interface Filters {
  position: 'ALL' | Position
  tournament: string
  nflTeam: string
}
