import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AvailabilityCalendar, dayState, monthGrid } from './AvailabilityCalendar'

afterEach(cleanup)

const AVAILABLE = ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-28', '2026-07-29']
const IN_SELECTION = ['2026-07-17', '2026-07-29']

describe('dayState', () => {
  it('distinguishes all four states', () => {
    expect(dayState('2026-07-20', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('none')
    expect(dayState('2026-07-16', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('data')
    expect(dayState('2026-07-17', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('inSelection')
    expect(dayState('2026-07-18', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('selected')
  })

  it('selected wins over in-selection', () => {
    expect(dayState('2026-07-29', AVAILABLE, IN_SELECTION, '2026-07-29')).toBe('selected')
  })

  it('with no cluster selected every available day is plain data', () => {
    expect(dayState('2026-07-17', AVAILABLE, [], '2026-07-18')).toBe('data')
  })
})

describe('monthGrid', () => {
  it('pads to whole weeks and covers every day of the month', () => {
    const grid = monthGrid(2026, 6)                 // July 2026, 0-indexed month
    expect(grid.length % 7).toBe(0)
    expect(grid.filter(Boolean)).toHaveLength(31)
    expect(grid.filter(Boolean)[0]).toBe('2026-07-01')
    expect(grid.filter(Boolean).at(-1)).toBe('2026-07-31')
  })

  it('handles a February in a leap year', () => {
    expect(monthGrid(2028, 1).filter(Boolean)).toHaveLength(29)
  })
})

describe('AvailabilityCalendar', () => {
  const props = {
    availableDates: AVAILABLE, selectionDates: IN_SELECTION,
    selectedDate: '2026-07-18', onSelect: vi.fn(),
  }

  it('opens on the selected date\'s month and names it', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()
  })

  it('labels each day with its availability state', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    expect(screen.getByRole('button', { name: '2026-07-16, has data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-17, has data in selection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-18, selected' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-20, no data' })).toBeInTheDocument()
  })

  it('shows a legend for all four states', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    expect(screen.getByText(/no data/i)).toBeInTheDocument()
    expect(screen.getByText(/in selection/i)).toBeInTheDocument()
  })

  it('emits the clicked day when it has data', () => {
    const onSelect = vi.fn()
    render(<AvailabilityCalendar {...props} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: '2026-07-29, has data in selection' }))

    expect(onSelect).toHaveBeenCalledWith('2026-07-29')
  })

  // Mirrors the backend's nearest-available rule rather than doing nothing.
  it('snaps an empty day to the nearest available date', () => {
    const onSelect = vi.fn()
    render(<AvailabilityCalendar {...props} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: '2026-07-20, no data' }))

    expect(onSelect).toHaveBeenCalledWith('2026-07-18')
  })

  it('navigates months', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: /Previous month/ }))
    expect(screen.getByText(/June 2026/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Next month/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()
  })

  // Mirrors RunPicker.test.tsx's "closes the dropdown on Escape"/"on an outside click" pair
  // (Task 9 review, Ruling 18b) — a popover that only closes via its own toggle traps the user.
  it('closes on Escape', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText(/July 2026/)).not.toBeInTheDocument()
  })

  it('closes on an outside click', () => {
    render(
      <div>
        <div data-testid="outside">elsewhere</div>
        <AvailabilityCalendar {...props} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId('outside'))

    expect(screen.queryByText(/July 2026/)).not.toBeInTheDocument()
  })
})

// Item 10: the calendar introduced rgba alpha steps 0.12 and 0.28. The hue is `--blue`, but
// those two steps were new — the base palette only ever uses 0.1/0.15/0.25/0.3/0.5/0.6, and
// spec §12 departure 5 sanctions the popover as "built from existing tokens".
describe('AvailabilityCalendar — palette hygiene', () => {
  const ALLOWED_ALPHAS = ['0.1', '0.15', '0.25', '0.3', '0.5', '0.6']

  it('uses only alpha steps the base palette already uses', async () => {
    // cwd is `frontend/` under vitest; `import.meta.url` is an http URL in the jsdom env.
    const source = await readFile('src/components/tab3/AvailabilityCalendar.tsx', 'utf8')
    const alphas = [...source.matchAll(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/g)]
      .map(m => m[1]!)
    expect(alphas.length).toBeGreaterThan(0)
    expect([...new Set(alphas)].filter(a => !ALLOWED_ALPHAS.includes(a))).toEqual([])
  })
})
