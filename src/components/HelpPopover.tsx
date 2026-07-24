'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'

interface Props {
  /** Heading shown at the top of the popover. */
  title: string
  /** Rich explainer content (what it shows / example / how to use it). */
  children: ReactNode
}

/**
 * A small "?" affordance that reveals a detailed explainer panel on click.
 * Used next to each Draft Trends section header so the concise caption stays
 * uncluttered while a fuller walk-through (with a concrete example and how to
 * act on it) is one click away. Closes on outside-click or Escape.
 */
export default function HelpPopover({ title, children }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`What is “${title}”?`}
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-light)'}`,
          background: open ? 'var(--accent)' : 'transparent',
          color: open ? '#ffffff' : '#64748b',
          fontSize: 10, fontWeight: 800, lineHeight: 1,
          cursor: 'pointer', padding: 0, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = '#94a3b8' } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = '#64748b' } }}
      >
        ?
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={title}
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 40,
            width: 'min(360px, 86vw)',
            padding: '14px 16px', borderRadius: 8,
            border: '1px solid var(--border-light)',
            background: 'var(--navy-900)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
            cursor: 'default',
          }}
        >
          <div style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.02em',
            color: '#e2e8f0', marginBottom: 8,
          }}>
            {title}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#94a3b8' }} className="help-body">
            {children}
          </div>
        </div>
      )}
    </span>
  )
}
