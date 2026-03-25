'use client'

import { useState } from 'react'
import { useDraftData } from '@/hooks/useDraftData'
import { usePredictions } from '@/hooks/usePredictions'
import CsvUpload from './CsvUpload'
import FilterBar from './FilterBar'
import ExposureTable from './ExposureTable'
import TeamList from './TeamList'
import TeamDetail from './TeamDetail'
import ProjectionsTable from './ProjectionsTable'

type MainView = 'exposures' | 'projections'

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

  const { predictions, isLoading: predLoading, error: predError } = usePredictions()

  const [mainView, setMainView] = useState<MainView>('exposures')
  const [showTeams, setShowTeams] = useState(true)

  const isLoading = draftLoading || predLoading
  const error = draftError || predError

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Best Ball Hub</h1>
            <p className="text-xs text-gray-500 mt-0.5">Exposure &amp; projections visualizer</p>
          </div>
          <CsvUpload
            onFileLoaded={loadFromFile}
            onReset={resetToDefault}
            usingDefault={usingDefault}
          />
        </div>

        {/* View toggles */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 flex-wrap">
          {/* Main view tabs */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => setMainView('exposures')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                mainView === 'exposures'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Exposures
            </button>
            <button
              onClick={() => setMainView('projections')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-gray-700 ${
                mainView === 'projections'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Projections
            </button>
          </div>

          {/* Teams toggle */}
          <button
            onClick={() => setShowTeams((v) => !v)}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              showTeams
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300'
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full border-2 transition-colors ${
                showTeams ? 'bg-indigo-400 border-indigo-400' : 'border-gray-600'
              }`}
            />
            Teams
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
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
          <div className={`grid gap-6 ${showTeams ? 'grid-cols-1 xl:grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>

            {/* Main content area */}
            <div className="space-y-4">
              {mainView === 'exposures' && data && (
                <>
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
                  />
                </>
              )}

              {mainView === 'projections' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold text-white">2026 Projections</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {predictions.length} players · ML predictions from 2011–2025 training data
                    </p>
                  </div>
                  <ProjectionsTable predictions={predictions} />
                </>
              )}
            </div>

            {/* Teams panel */}
            {showTeams && data && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-white">My Teams</h2>
                <TeamList
                  entries={data.entries}
                  selectedEntryId={selectedEntryId}
                  onSelect={setSelectedEntryId}
                />
                {selectedEntry && (
                  <div className="mt-4 bg-gray-900/60 rounded-xl border border-gray-800 p-4">
                    <TeamDetail entry={selectedEntry} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
