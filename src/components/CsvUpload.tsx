'use client'

import { useRef } from 'react'

interface Props {
  onFileLoaded: (file: File) => void
  onReset: () => void
  usingDefault: boolean
}

export default function CsvUpload({ onFileLoaded, onReset, usingDefault }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileLoaded(file)
    // Reset input so same file can be re-uploaded
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label
        className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        Upload CSV
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleChange}
        />
      </label>

      {usingDefault ? (
        <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-3 py-1.5 rounded-full">
          Using default data (Underdog March 2025)
        </span>
      ) : (
        <button
          onClick={onReset}
          className="text-xs text-gray-400 hover:text-white underline transition-colors"
        >
          Reset to default data
        </button>
      )}
    </div>
  )
}
