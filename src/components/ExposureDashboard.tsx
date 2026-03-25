'use client'

import { useState } from 'react'
import { useDraftData } from '@/hooks/useDraftData'
import { usePredictions, PredSplit } from '@/hooks/usePredictions'
import CsvUpload from './CsvUpload'
import FilterBar from './FilterBar'
import ExposureTable from './ExposureTable'
import TeamList from './TeamList'
import TeamDetail from './TeamDetail'

// Teams panel: hidden | sidebar (right column) | full (full width, hides main)
type TeamsMode = 'hidden' | 'sidebar' | 'full'

const SPLITS: { key: PredSplit; label: string; color: string }[] = [
  { key: 'C', label: 'Ceiling', color: 'text-amber-300' },
  { key: 'M', label: 'Median',  color: 'text-emerald-300' },
  { key: 'F', label: 'Floor',   color: 'text-sky-300' },
]

export default function ExposureDashboard() {
  const {
    data,
    filters,
    setFilters,
    selectedEntryId,
    setSelectedEntryId,
    filteredExposures,
    selectedEntry,
    loadFromFile,
    resetToDefault,
    isLoading: draftLoading,
    error: draftError,
    usingDefault,
  } = useDraftData()

  const { getPred, isLoading: predLoading, error: predError } = usePredictions()

  const [teamsMode, setTeamsMode] = useState<TeamsMode>('sidebar')
  const [activeSplit, setActiveSplit] = useState<PredSplit>('M')

  const isLoading = draftLoading || predLoading
  const error = draftError || predError

  function cycleTeams() {
    setTeamsMode((m) => m === 'hidden' ? 'sidebar' : m === 'sidebar' ? 'full' : 'hidden')
  }

  const teamsLabel = teamsMode === 'hidden' ? 'Show Teams' : teamsMode === 'sidebar' ? 'Expand Teams' : 'Hide Teams'

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Best Ball Hub</h1>
            <p className="text-xs text-gray-500 mt-0.5">Exposure visualizer</p>
          </div>
          <CsvUpload onFileLoaded={loadFromFile} onReset={resetToDefault} usingDefault={usingDefault} />
        </div>

        {/* Controls bar */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-3 flex-wrap">
          {/* Split toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 mr-1">Projections:</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {SPLITS.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setActiveSplit(key)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors border-l first:border-l-0 border-gray-700 ${
                    activeSplit === key
                      ? `bg-gray-700 ${color}`
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {key} <span className="text-xs opacity-60 hidden sm:inline">— {label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Teams mode toggle */}
          <button
            onClick={cycleTeams}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ml-auto ${
              teamsMode !== 'hidden'
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            {teamsMode === 'full' && <span className="text-xs">◀</span>}
            {teamsMode === 'sidebar' && <span className="text-xs">▶▶</span>}
            {teamsMode === 'hidden' && <span className="text-xs">▶</span>}
            {teamsLabel}
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-32 text-gray-500">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm">Loading data…</p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-6 ${teamsMode === 'sidebar' ? 'grid-cols-1 xl:grid-cols-[1fr_380px]' : 'grid-cols-1'}`}>

            {/* Exposures — hidden when teams is full */}
            {teamsMode !== 'full' && data && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">Player Exposures</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {filteredExposures.length} players · {data.totalEntries} teams
                    </p>
                  </div>
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
                      : data.entries.filter((e) => e.tournament === filters.tournament).length
                  }
                  getPred={getPred}
                  activeSplit={activeSplit}
                />
              </div>
            )}

            {/* Teams panel */}
            {teamsMode !== 'hidden' && data && (
              <div className={`space-y-4 ${teamsMode === 'full' ? 'grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 items-start' : ''}`}>
                <div className="space-y-3">
                  <h2 className="text-base font-semibold text-white">My Teams</h2>
                  <TeamList
                    entries={data.entries}
                    selectedEntryId={selectedEntryId}
                    onSelect={setSelectedEntryId}
                  />
                </div>
                {selectedEntry ? (
                  <div className={`bg-gray-900/60 rounded-xl border border-gray-800 p-4 ${teamsMode !== 'full' ? 'mt-4' : ''}`}>
                    <TeamDetail entry={selectedEntry} getPred={getPred} activeSplit={activeSplit} />
                  </div>
                ) : (
                  teamsMode === 'full' && (
                    <div className="flex items-center justify-center h-48 text-gray-600 text-sm border border-gray-800 rounded-xl">
                      Select a team to view details
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
