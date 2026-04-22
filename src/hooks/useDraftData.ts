'use client'

import { useState, useEffect, useMemo } from 'react'
import { ProcessedData, Filters, PlayerExposure, DraftEntry } from '@/lib/types'
import { parseCSVFromText, parseCSVFromFile } from '@/lib/parseCSV'
import { processRawRows, applyFilters } from '@/lib/processData'

const DEFAULT_FILTERS: Filters = { position: 'ALL', tournament: 'ALL', nflTeam: 'ALL' }

export function useDraftData(defaultCsvUrl = '/default-data.csv') {
  const [data, setData] = useState<ProcessedData | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [usingDefault, setUsingDefault] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    setFilters(DEFAULT_FILTERS)
    setSelectedEntryId(null)
    setUsingDefault(true)
    fetch(defaultCsvUrl)
      .then((r) => r.text())
      .then((text) => parseCSVFromText(text))
      .then((rows) => {
        setData(processRawRows(rows))
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to load default data')
        setIsLoading(false)
      })
  }, [defaultCsvUrl])

  async function loadFromFile(file: File) {
    setIsLoading(true)
    setError(null)
    try {
      const rows = await parseCSVFromFile(file)
      setData(processRawRows(rows))
      setFilters(DEFAULT_FILTERS)
      setSelectedEntryId(null)
      setUsingDefault(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV')
    } finally {
      setIsLoading(false)
    }
  }

  function resetToDefault() {
    setIsLoading(true)
    setError(null)
    fetch(defaultCsvUrl)
      .then((r) => r.text())
      .then(async (text) => {
        const rows = await parseCSVFromText(text)
        setData(processRawRows(rows))
        setFilters(DEFAULT_FILTERS)
        setSelectedEntryId(null)
        setUsingDefault(true)
      })
      .catch((err) => setError(err.message ?? 'Failed to reload'))
      .finally(() => setIsLoading(false))
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
    resetToDefault,
    isLoading,
    error,
    usingDefault,
  }
}
