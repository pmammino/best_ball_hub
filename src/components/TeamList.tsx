'use client'

import { DraftEntry } from '@/lib/types'

interface Props {
  entries: DraftEntry[]
  selectedEntryId: string | null
  onSelect: (entryId: string) => void
}

export default function TeamList({ entries, selectedEntryId, onSelect }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <button
          key={entry.entryId}
          onClick={() => onSelect(entry.entryId === selectedEntryId ? '' : entry.entryId)}
          className={`text-left px-4 py-3 rounded-lg text-sm transition-colors ${
            entry.entryId === selectedEntryId
              ? 'bg-indigo-700 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
        >
          <div className="font-medium">{entry.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{entry.picks.length} picks</div>
        </button>
      ))}
    </div>
  )
}
