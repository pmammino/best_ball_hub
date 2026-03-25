'use client'

import { useDraftData } from '@/hooks/useDraftData'
import CsvUpload from './CsvUpload'
import FilterBar from './FilterBar'
import ExposureTable from './ExposureTable'
import TeamList from './TeamList'
import TeamDetail from './TeamDetail'

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
    isLoading,
    error,
    usingDefault,
  } = useDraftData()

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">Best Ball Hub</h1>
            <p className="text-xs text-gray-500 mt-0.5">Exposure visualizer</p>
          </div>
          <CsvUpload
            onFileLoaded={loadFromFile}
            onReset={resetToDefault}
            usingDefault={usingDefault}
          />
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
              <p className="text-sm">Loading draft data…</p>
            </div>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
            {/* Left: exposure table */}
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
                  // When tournament filter active, denominator is the filtered count
                  filters.tournament === 'ALL'
                    ? data.totalEntries
                    : data.entries.filter((e) => e.tournament === filters.tournament).length
                }
              />
            </div>

            {/* Right: team drill-down */}
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
          </div>
        ) : null}
      </main>
    </div>
  )
}
