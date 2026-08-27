import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RunPicker, formatRunLabel, pickDefaultRun } from './RunPicker'
import type { RunT } from '../../api/clusterQueries'

afterEach(cleanup)

const run = (date: string, status = 'SUCCESS', hour = '04'): RunT => ({
  date, clusterName: 'cl-a', jobId: `job-${date}`,
  appStartIso: `${date}T${hour}:52:00.000Z`, durationMin: 44.62, status, message: '',
})

const TEN = Array.from({ length: 10 }, (_, i) => run(`2026-07-${String(20 + i).padStart(2, '0')}`))
  .reverse()   // served newest-first

describe('formatRunLabel', () => {
  it('reads date, UTC time, duration and outcome', () => {
    expect(formatRunLabel(run('2026-07-29'))).toBe('2026-07-29 · 04:52 UTC · 44m 37s · OK')
  })

  it('maps FAILED to KO and an unknown status to a dash', () => {
    expect(formatRunLabel(run('2026-07-29', 'FAILED'))).toContain('· KO')
    expect(formatRunLabel(run('2026-07-29', ''))).toContain('· —')
  })

  it('survives a missing duration and a missing timestamp', () => {
    expect(formatRunLabel({ ...run('2026-07-29'), durationMin: undefined })).toBe('2026-07-29 · 04:52 UTC · — · OK')
    expect(formatRunLabel({ ...run('2026-07-29'), appStartIso: '' })).toBe('2026-07-29 · 44m 37s · OK')
  })
})

describe('pickDefaultRun', () => {
  it('prefers the run on the requested date', () => {
    expect(pickDefaultRun(TEN, '2026-07-25')!.date).toBe('2026-07-25')
  })

  it('falls back to the newest run when the date has none', () => {
    expect(pickDefaultRun(TEN, '2020-01-01')!.date).toBe('2026-07-29')
    expect(pickDefaultRun(TEN, null)!.date).toBe('2026-07-29')
  })

  it('returns null for an empty history', () => {
    expect(pickDefaultRun([], '2026-07-25')).toBeNull()
  })
})

describe('RunPicker', () => {
  it('renders one bar per run, up to ten', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(10)
  })

  // The user's explicit requirement: unselected runs stay visible, just not highlighted.
  it('dims the unselected runs rather than hiding them', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    const bars = screen.getAllByRole('button', { name: /^Run 2026-07-/ })
    const selected = screen.getByRole('button', { name: 'Run 2026-07-25' })

    expect(bars).toHaveLength(10)
    bars.forEach(bar => expect(bar).toBeVisible())
    expect(selected.style.opacity).toBe('1')
    expect(bars.filter(b => b !== selected).every(b => Number(b.style.opacity) < 1)).toBe(true)
  })

  it('marks the selected bar with aria-pressed', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Run 2026-07-25' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Run 2026-07-24' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits the clicked run', () => {
    const onSelect = vi.fn()
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run 2026-07-22' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].date).toBe('2026-07-22')
    expect(onSelect.mock.calls[0][0].jobId).toBe('job-2026-07-22')
  })

  it('shows the selected run label, and lists every run in the dropdown', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    expect(screen.getByText(/2026-07-25 · 04:52 UTC/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Choose run/ }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(10)
  })

  it('renders bars oldest to newest, left to right', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={() => {}} />)
    const names = screen.getAllByRole('button', { name: /^Run 2026-07-/ }).map(b => b.getAttribute('aria-label'))
    expect(names[0]).toBe('Run 2026-07-20')
    expect(names.at(-1)).toBe('Run 2026-07-29')
  })

  it('renders nothing for an empty history', () => {
    const { container } = render(<RunPicker runs={[]} selectedDate={null} onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
