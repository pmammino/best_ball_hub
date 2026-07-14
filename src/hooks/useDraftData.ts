'use client'

import { useState, useMemo } from 'react'
import { ProcessedData, Filters, PlayerExposure, DraftEntry } from '@/lib/types'
import { parseCSVFromFile } from '@/lib/parseCSV'
import { processRawRows, applyFilters } from '@/lib/processData'

const DEFAULT_FILTERS: Filters = { position: 'ALL', tournament: 'ALL', nflTeam: 'ALL' }

/**
 * Draft-portfolio state. There is no bundled/default dataset — the user must
 * upload their own Underdog draft export before any data is shown. Until then
 * `data` is null and consumers should render an upload prompt.
 */
export function useDraftData() {
  const [data, setData] = useState<ProcessedData | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadFromFile(file: File) {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await parseCSVFromFile(file)
      const processed = processRawRows(rows)
      if (processed.totalEntries === 0) {
        throw new Error('No draft entries found in this file. Is it an Underdog draft export?')
      }
      setData(processed)
      setFilters(DEFAULT_FILTERS)
      setSelectedEntryId(null)
    } catch (err: unknown) {
      setData(null)
      setError(err instanceof Error ? err.message : 'Failed to parse CSV')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredExposures: PlayerExposure[] = useMemo(() => {
    if (!data) return []
    return applyFilters(data, filters)
  }, [data, filters])

  const selectedEntry: DraftEntry | null = useMemo(() => {
    if (!data || !selectedEntryId) return null
    return data.entries.find((e) => e.entryId === selectedEntryId) ?? null
  }, [data, selectedEntryId])

  return {
    data,
    filters,
    setFilters,
    selectedEntryId,
    setSelectedEntryId,
    filteredExposures,
    selectedEntry,
    loadFromFile,
    isLoading,
    error,
  }
}
