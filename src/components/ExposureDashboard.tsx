'use client'

import { useState, useCallback } from 'react'
import { useDraftData } from '@/hooks/useDraftData'
import { usePredictions, PredSplit, PlayerPrediction } from '@/hooks/usePredictions'
import { usePlayerMap } from '@/hooks/usePlayerMap'
import { useTeamScores } from '@/hooks/useTeamScores'
import { useAdpData } from '@/hooks/useAdpData'
import type { Player } from '@/lib/types'
import CsvUpload from './CsvUpload'
import FilterBar from './FilterBar'
import ExposureTable from './ExposureTable'
import TeamList from './TeamList'
import TeamDetail from './TeamDetail'
import PlayerComboPanel from './PlayerComboPanel'
import DraftTrends from './DraftTrends'
import { LogoLockup, LogoMark } from './Logo'

type Tab = 'teams' | 'exposures' | 'combo' | 'trends'

const TABS: { key: Tab; label: string }[] = [
  { key: 'teams',     label: 'Teams'        },
  { key: 'exposures', label: 'Exposures'    },
  { key: 'combo',     label: 'Combo'        },
  { key: 'trends',    label: 'Draft Trends' },
]

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
    filteredExposures, selectedEntry, loadFromFile,
    isLoading: draftLoading, error: draftError,
  } = useDraftData()

  const { predById, getPred: getPredByName, isLoading: predLoading, error: predError } = usePredictions()
  const { underdogToNflId } = usePlayerMap()
  const { adpMap, appearanceToUnderdogId } = useAdpData()

  // ID-first projection lookup:
  //   draft appearance id → Underdog player id → nfl_news_id → projection.
  // Falls back to name matching only when a player is missing from the id map.
  const getPred = useCallback((player: Player): PlayerPrediction | undefined => {
    const underdogId = appearanceToUnderdogId.get(player.appearance)
    const nflId = underdogId ? underdogToNflId.get(underdogId) : undefined
    if (nflId) {
      const byId = predById.get(nflId)
      if (byId) return byId
    }
    return getPredByName(player.fullName)
  }, [appearanceToUnderdogId, underdogToNflId, predById, getPredByName])

  const teamScores = useTeamScores(data?.entries ?? [], getPred)

  const [activeTab,   setActiveTab]   = useState<Tab>('teams')
  const [activeSplit, setActiveSplit] = useState<PredSplit>('M')
  const [comboNames,  setComboNames]  = useState<string[]>([])

  function addComboPlayer(name: string) {
    setComboNames(prev => prev.includes(name) ? prev : [...prev, name])
  }
  function removeComboPlayer(name: string) {
    setComboNames(prev => prev.filter(n => n !== name))
  }

  // Projections load on mount; only block the UI on projections once the user
  // has provided a draft file. Before that we show the upload gate.
  const isLoading = draftLoading || (!!data && predLoading)
  const error = draftError || predError

  return (
    <div className="min-h-screen" style={{ background: 'var(--navy-950)' }}>

      {/* Top accent bar */}
      <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #a01223 0%, #f22e45 50%, #a01223 100%)' }} />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b" style={{ background: 'var(--dark-surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">

          {/* Top row: logo + season toggle + upload */}
          <div className="flex items-center justify-between h-12 gap-4">
            <div className="flex items-center gap-3">
              <LogoLockup className="h-7 w-auto" />


              {data && (
                <span className="hidden sm:block text-xs px-2 py-0.5 rounded-full border" style={{ color: '#64748b', borderColor: 'var(--border-light)', background: 'var(--navy-800)' }}>
                  {data.totalEntries} teams · {data.entries[0]?.picks.length ?? 0} picks/team
                </span>
              )}
            </div>
            <CsvUpload onFileLoaded={loadFromFile} hasData={!!data} />
          </div>

          {/* Nav row: tabs + split pills */}
          <div className="flex items-center justify-between pb-2.5 gap-4 flex-wrap">

            {/* Tab pills */}
            <div className="flex gap-1.5">
              {TABS.map(({ key, label }) => (
                <button key={key}
                  onClick={() => setActiveTab(key)}
                  style={{
                    padding: '4px 16px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    background: activeTab === key ? '#f22e45' : 'transparent',
                    color: activeTab === key ? '#ffffff' : '#475569',
                    border: `1px solid ${activeTab === key ? '#f22e45' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = '#94a3b8' }}
                  onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = '#475569' }}
                >
                  {label}
                </button>
              ))}
            </div>

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
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#f22e45', borderTopColor: 'transparent' }} />
              <p className="text-xs uppercase tracking-widest" style={{ color: '#475569' }}>Loading data…</p>
            </div>
          </div>
        ) : data ? (
          <>
            {/* ── Teams ── */}
            {activeTab === 'teams' && (
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5 items-start">
                <div className="space-y-2">
                  <h2 className="section-header">My Teams</h2>
                  <TeamList
                    entries={data.entries}
                    selectedEntryId={selectedEntryId}
                    onSelect={setSelectedEntryId}
                    teamScores={teamScores}
                  />
                </div>
                {selectedEntry ? (
                  <div className="rounded-lg border p-4" style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
                    <TeamDetail
                      entry={selectedEntry}
                      getPred={getPred}
                      activeSplit={activeSplit}
                      teamScore={teamScores.get(selectedEntry.entryId)}
                      adpMap={adpMap}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 rounded-lg border text-xs uppercase tracking-widest"
                    style={{ borderColor: 'var(--border)', color: '#334155' }}>
                    Select a team →
                  </div>
                )}
              </div>
            )}

            {/* ── Exposures ── */}
            {activeTab === 'exposures' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h2 className="section-header">Player Exposures</h2>
                  <span className="text-xs" style={{ color: '#475569' }}>{filteredExposures.length} players</span>
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
                  comboNames={comboNames}
                  onAddToCombo={(name) => { addComboPlayer(name); setActiveTab('combo') }}
                  adpMap={adpMap}
                />
              </div>
            )}

            {/* ── Combo ── */}
            {activeTab === 'combo' && (
              <PlayerComboPanel
                entries={data.entries}
                allExposures={data.exposures}
                comboNames={comboNames}
                onAdd={addComboPlayer}
                onRemove={removeComboPlayer}
                onClear={() => setComboNames([])}
                getPred={getPred}
                activeSplit={activeSplit}
              />
            )}

            {/* ── Draft Trends ── */}
            {activeTab === 'trends' && (
              <DraftTrends entries={data.entries} teamScores={teamScores} />
            )}
          </>
        ) : (
          /* ── Upload gate — nothing is shown until the user provides their data ── */
          <div className="flex items-center justify-center py-32">
            <div className="max-w-md w-full text-center rounded-xl border px-8 py-10"
              style={{ background: 'var(--navy-800)', borderColor: 'var(--border)' }}>
              <LogoMark className="w-12 h-12 mx-auto mb-4" />
              <h2 className="text-white text-lg font-bold mb-2">Upload your drafts to begin</h2>
              <p className="text-sm mb-6" style={{ color: '#94a3b8' }}>
                Export your Underdog draft entries as a CSV and upload it here. Your
                teams, exposures, and grades are computed entirely in your browser —
                nothing is uploaded to a server.
              </p>
              <div className="flex justify-center">
                <CsvUpload onFileLoaded={loadFromFile} label="UPLOAD DRAFT CSV" />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
