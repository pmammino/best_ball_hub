'use client'

import { useState } from 'react'
import { useDraftData } from '@/hooks/useDraftData'
import { usePredictions, PredSplit } from '@/hooks/usePredictions'
import CsvUpload from './CsvUpload'
import FilterBar from './FilterBar'
import ExposureTable from './ExposureTable'
import TeamList from './TeamList'
import TeamDetail from './TeamDetail'

type TeamsMode = 'hidden' | 'sidebar' | 'full'

const SPLITS: { key: PredSplit; label: string }[] = [
  { key: 'C', label: 'Ceiling' },
  { key: 'M', label: 'Median'  },
  { key: 'F', label: 'Floor'   },
]

const SPLIT_ACTIVE: Record<PredSplit, string> = {
  C: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  M: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  F: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
}

export default function ExposureDashboard() {
  const {
    data, filters, setFilters, selectedEntryId, setSelectedEntryId,
    filteredExposures, selectedEntry, loadFromFile, resetToDefault,
    isLoading: draftLoading, error: draftError, usingDefault,
  } = useDraftData()

  const { getPred, isLoading: predLoading, error: predError } = usePredictions()

  const [teamsMode, setTeamsMode] = useState<TeamsMode>('sidebar')
  const [activeSplit, setActiveSplit] = useState<PredSplit>('M')

  const isLoading = draftLoading || predLoading
  const error = draftError || predError

  function cycleTeams() {
    setTeamsMode(m => m === 'hidden' ? 'sidebar' : m === 'sidebar' ? 'full' : 'hidden')
  }

  const teamsLabel = teamsMode === 'hidden' ? 'Show Teams' : teamsMode === 'sidebar' ? 'Expand' : 'Collapse'
  const teamsIcon  = teamsMode === 'hidden' ? '▸' : teamsMode === 'sidebar' ? '⤢' : '⤡'

  return (
    <div className="min-h-screen" style={{ background: 'var(--navy-950)' }}>

      {/* Top accent bar */}
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 50%, #1d4ed8 100%)' }} />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b" style={{ background: 'var(--navy-900)', borderColor: 'var(--border)' }}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">

          {/* Top row: logo + upload */}
          <div className="flex items-center justify-between h-12 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded flex items-center justify-center text-white font-black text-xs" style={{ background: 'var(--accent)' }}>BB</div>
                <span className="font-bold text-white text-base tracking-tight">BestBall <span className="text-blue-400">Hub</span></span>
              </div>
              {data && (
                <span className="hidden sm:block text-xs px-2 py-0.5 rounded-full border" style={{ color: '#64748b', borderColor: 'var(--border-light)', background: 'var(--navy-800)' }}>
                  {data.totalEntries} teams · {data.entries[0]?.picks.length ?? 0} picks/team
                </span>
              )}
            </div>
            <CsvUpload onFileLoaded={loadFromFile} onReset={resetToDefault} usingDefault={usingDefault} />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3 pb-2.5 flex-wrap">

            {/* Projection split pills */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold uppercase tracking-widest mr-1" style={{ color: '#475569' }}>Proj</span>
              <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--border-light)' }}>
                {SPLITS.map(({ key, label }) => (
                  <button key={key}
                    onClick={() => setActiveSplit(key)}
                    className={`px-3 py-1 text-xs font-semibold transition-all border-l first:border-l-0 ${activeSplit === key ? SPLIT_ACTIVE[key] : 'text-slate-500 hover:text-slate-300'}`}
                    style={{ borderColor: 'var(--border-light)', background: activeSplit === key ? undefined : 'var(--navy-800)' }}
                  >
                    {key}
                    <span className="hidden sm:inline ml-1 font-normal opacity-60">— {label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Teams toggle */}
            <button
              onClick={cycleTeams}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border transition-all"
              style={{
                background: teamsMode !== 'hidden' ? 'var(--navy-700)' : 'var(--navy-800)',
                borderColor: teamsMode !== 'hidden' ? '#334155' : 'var(--border)',
                color: teamsMode !== 'hidden' ? '#e2e8f0' : '#475569',
              }}
            >
              <span>{teamsIcon}</span> {teamsLabel} Teams
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
        {error && (
          <div className="mb-4 rounded border px-4 py-3 text-sm" style={{ background: '#1c0f0f', borderColor: '#7f1d1d', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-40">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs uppercase tracking-widest" style={{ color: '#475569' }}>Loading data…</p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-5 ${teamsMode === 'sidebar' ? 'grid-cols-1 xl:grid-cols-[1fr_380px]' : 'grid-cols-1'}`}>

            {/* Exposures panel */}
            {teamsMode !== 'full' && data && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="section-header">Player Exposures</h2>
                  <span className="text-xs" style={{ color: '#475569' }}>
                    {filteredExposures.length} players
                  </span>
                </div>
                <FilterBar
                  filters={filters}
                  tournaments={data.tournaments}
                  nflTeams={data.nflTeams}
                  onChange={setFilters}
                />
                <ExposureTable
                  exposures={filteredExposures}
                  totalEntries={
                    filters.tournament === 'ALL'
                      ? data.totalEntries
                      : data.entries.filter(e => e.tournament === filters.tournament).length
                  }
                  getPred={getPred}
                  activeSplit={activeSplit}
                />
              </div>
            )}

            {/* Teams panel */}
            {teamsMode !== 'hidden' && data && (
              <div className={teamsMode === 'full'
                ? 'grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-start'
                : 'space-y-3'
              }>
                <div className="space-y-2">
                  <h2 className="section-header">My Teams</h2>
                  <TeamList
                    entries={data.entries}
                    selectedEntryId={selectedEntryId}
                    onSelect={setSelectedEntryId}
                  />
                </div>
                {selectedEntry ? (
                  <div className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
                    <TeamDetail entry={selectedEntry} getPred={getPred} activeSplit={activeSplit} />
                  </div>
                ) : teamsMode === 'full' ? (
                  <div className="flex items-center justify-center h-40 rounded-lg border text-xs uppercase tracking-widest"
                    style={{ borderColor: 'var(--border)', color: '#334155' }}>
                    Select a team
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
