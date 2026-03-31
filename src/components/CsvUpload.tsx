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
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      <label style={{
        cursor: 'pointer',
        background: 'var(--accent)',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '5px 12px',
        borderRadius: 4,
        transition: 'opacity 0.15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        UPLOAD CSV
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
      </label>

      {usingDefault ? (
        <span style={{ fontSize: 10, color: '#475569', letterSpacing: '0.04em' }}>
          Sample data loaded
        </span>
      ) : (
        <button onClick={onReset}
          style={{ fontSize: 10, color: '#475569', textDecoration: 'underline', letterSpacing: '0.04em', cursor: 'pointer' }}>
          Reset
        </button>
      )}
    </div>
  )
}
