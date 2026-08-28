import { useEffect, useRef, useState } from 'react'
import { nearestAvailableDate } from './dateWindow'

/**
 * Task 16 — the availability calendar (spec §7.4). Today the `TimePicker`'s
 * `<input type="date">` presents every day as equally valid and silently snaps to the
 * nearest available one; you discover which days b15 actually has data for by clicking
 * around. This is an additive sibling affordance next to `TimePicker` — it never touches
 * `TimePicker`'s own markup (ADR-0005).
 */
export type DayState = 'none' | 'data' | 'inSelection' | 'selected'

/** `selected` wins over `inSelection`; with no cluster selected `inSelection` is always
 * empty, so every available day renders as plain `data`. */
export function dayState(
  iso: string,
  available: string[],
  inSelection: string[],
  selected: string | null,
): DayState {
  if (iso === selected) return 'selected'
  if (inSelection.includes(iso)) return 'inSelection'
  return available.includes(iso) ? 'data' : 'none'
}

/** ISO days of `month` (0-indexed) padded with nulls to whole Monday-first weeks. Built
 * entirely in UTC (`Date.UTC`) — the corpus dates are UTC ISO strings, and a
 * local-timezone `new Date(y, m, d)` would shift days across a boundary. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7                      // Monday-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const STATE_LABEL: Record<DayState, string> = {
  none: 'no data',
  data: 'has data',
  inSelection: 'has data in selection',
  selected: 'selected',
}

const LEGEND: { state: DayState; label: string }[] = [
  { state: 'data', label: 'Has data' },
  { state: 'inSelection', label: 'Has data in selection' },
  { state: 'selected', label: 'Selected' },
  { state: 'none', label: 'No data' },
]

/** Just the swatch colours — shared by a day cell's own background and the legend's dot. */
function swatchStyle(state: DayState): { background: string; border: string } {
  switch (state) {
    case 'none': return { background: 'var(--surface)', border: '1px solid var(--border)' }
    case 'data': return { background: 'rgba(79,156,249,0.1)', border: '1px solid transparent' }
    case 'inSelection': return { background: 'rgba(79,156,249,0.25)', border: '1px solid transparent' }
    case 'selected': return { background: 'rgba(79,156,249,0.25)', border: '1px solid #4f9cf9' }
  }
}

function dayStyle(state: DayState): React.CSSProperties {
  return {
    fontSize: 10, fontFamily: 'JetBrains Mono, monospace', borderRadius: 4,
    padding: '4px 0', cursor: 'pointer',
    color: state === 'none' ? 'var(--text-dim)' : 'var(--text)',
    ...swatchStyle(state),
  }
}

function viewOf(iso: string | null): { year: number; month: number } {
  if (iso) {
    const [y, m] = iso.split('-').map(Number)
    return { year: y!, month: m! - 1 }
  }
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
}

export interface AvailabilityCalendarProps {
  /** Every ISO date b15 has at least one row for. */
  availableDates: string[]
  /** ISO dates within the currently selected clusters (a subset of `availableDates`). */
  selectionDates: string[]
  selectedDate: string | null
  onSelect: (iso: string) => void
}

export function AvailabilityCalendar({
  availableDates, selectionDates, selectedDate, onSelect,
}: AvailabilityCalendarProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => viewOf(selectedDate))
  const rootRef = useRef<HTMLDivElement>(null)

  // Task 9 review, Ruling 18b (mirrored here per Task 16's review): a popover that only closes by
  // re-clicking its own toggle traps the user into hunting for it. Escape and an outside click
  // both close it — listeners attached only while `open`, removed on close/unmount so nothing
  // stays attached while the popover is hidden. Same shape as RunPicker.tsx.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  const toggle = () => {
    if (!open) setView(viewOf(selectedDate))     // re-open always onto the selected date's month
    setOpen(o => !o)
  }

  const prevMonth = () => setView(v => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }))
  const nextMonth = () => setView(v => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }))

  const handleDayClick = (iso: string) => {
    const state = dayState(iso, availableDates, selectionDates, selectedDate)
    // Clicking an empty day snaps to the nearest available date — reusing the SAME client
    // mirror of the backend's nearest-available rule TimePicker's own date input uses, rather
    // than a second copy that could drift from it.
    onSelect(state === 'none' ? nearestAvailableDate(iso, availableDates) : iso)
  }

  const grid = monthGrid(view.year, view.month)

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label={open ? 'Hide calendar' : 'Show calendar'}
        onClick={toggle}
        style={{
          width: 26, height: 26, background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 30,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          padding: 12, width: 232,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button aria-label="Previous month" onClick={prevMonth} style={navBtnStyle}>‹</button>
            <span style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
              {MONTH_NAMES[view.month]} {view.year}
            </span>
            <button aria-label="Next month" onClick={nextMonth} style={navBtnStyle}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAY_LABELS.map(w => (
              <div key={w} style={{ fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>{w}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {grid.map((iso, i) => {
              if (!iso) return <div key={i} />
              const state = dayState(iso, availableDates, selectionDates, selectedDate)
              const day = Number(iso.slice(-2))
              return (
                <button
                  key={iso}
                  aria-label={`${iso}, ${STATE_LABEL[state]}`}
                  onClick={() => handleDayClick(iso)}
                  style={dayStyle(state)}
                >{day}</button>
              )
            })}
          </div>

          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {LEGEND.map(({ state, label }) => (
              <div key={state} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, ...swatchStyle(state) }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  width: 18, height: 18, background: 'transparent', border: 'none',
  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
