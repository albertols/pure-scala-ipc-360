import { useState } from 'react'
import type { RunT } from '../../api/clusterQueries'

const OK = '#34d399'
const KO = '#f87171'
const NONE = '#2a3050'

/** Opacity for a run that is present but not the one the links point at. Visible, not highlighted. */
const DIMMED = 0.55

function statusColor(status: string | undefined): string {
  return status === 'SUCCESS' ? OK : status === 'FAILED' ? KO : NONE
}

function outcome(status: string | undefined): string {
  return status === 'SUCCESS' ? 'OK' : status === 'FAILED' ? 'KO' : '—'
}

function durationLabel(durationMin: number | undefined): string {
  if (durationMin == null) return '—'
  const total = Math.round(durationMin * 60)
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/** `2026-07-29 · 04:52 UTC · 44m 37s · OK`. The UTC segment drops out if b15 carried no timestamp. */
export function formatRunLabel(run: RunT): string {
  const parts = [run.date ?? '']
  const iso = run.appStartIso ?? ''
  if (iso.length >= 16) parts.push(`${iso.slice(11, 16)} UTC`)
  parts.push(durationLabel(run.durationMin ?? undefined))
  parts.push(outcome(run.status))
  return parts.join(' · ')
}

/** The run a card should point at: the one on `preferredDate`, else the newest. */
export function pickDefaultRun(runs: RunT[], preferredDate: string | null): RunT | null {
  if (runs.length === 0) return null
  if (preferredDate) {
    const onDate = runs.find(r => r.date === preferredDate)
    if (onDate) return onDate
  }
  return runs[0]!   // served newest-first
}

/**
 * Selectable run history, shared by Tab 3's cards and Tab 4's Operational State so there is exactly
 * one implementation of "which execution do the links open".
 *
 * `runs` arrives newest-first (as `/api/operational/runs` serves it) and is rendered oldest-to-newest
 * left to right, matching the direction the previous read-only history strip used.
 */
export function RunPicker({ runs, selectedDate, onSelect, accent = '#4f9cf9', limit = 10 }: {
  runs: RunT[]
  selectedDate: string | null
  onSelect: (run: RunT) => void
  accent?: string
  limit?: number
}) {
  const [open, setOpen] = useState(false)
  if (runs.length === 0) return null

  const shown = runs.slice(0, limit)
  const oldestFirst = [...shown].reverse()
  const selected = shown.find(r => r.date === selectedDate) ?? shown[0]!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {oldestFirst.map(run => {
          const isSelected = run.date === selected.date
          return (
            <button
              key={run.date}
              aria-label={`Run ${run.date}`}
              aria-pressed={isSelected}
              title={formatRunLabel(run)}
              onClick={e => { e.stopPropagation(); onSelect(run) }}
              style={{
                width: 7, height: 16, borderRadius: 1.5, padding: 0, cursor: 'pointer',
                background: statusColor(run.status),
                border: isSelected ? `1px solid ${accent}` : '1px solid transparent',
                opacity: isSelected ? 1 : DIMMED,
                flexShrink: 0,
              }}
            />
          )
        })}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          aria-label="Choose run"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-muted)', fontSize: 10, padding: '3px 7px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', textAlign: 'left',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(selected.status), flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatRunLabel(selected)}
          </span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
              maxHeight: 190, overflowY: 'auto',
            }}
          >
            {shown.map(run => (
              <button
                key={run.date}
                role="menuitem"
                onClick={e => { e.stopPropagation(); onSelect(run); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: run.date === selected.date ? 'var(--surface-3)' : 'transparent',
                  border: 'none', color: 'var(--text-muted)', fontSize: 10, padding: '4px 7px',
                  cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(run.status), flexShrink: 0 }} />
                {formatRunLabel(run)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
