import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProgressStrip } from './ProgressStrip'

afterEach(cleanup)

describe('ProgressStrip', () => {
  it('states tasks done against total, and the ADR count', () => {
    render(<ProgressStrip progress={{ tasksDone: 596, tasksTotal: 601, adrs: 16 }} />)

    expect(screen.getByText(/596/)).toBeInTheDocument()
    expect(screen.getByText(/601/)).toBeInTheDocument()
    expect(screen.getByText(/16/)).toBeInTheDocument()
  })

  // A deployment without docs/ serves progress: null. That must be silence, not a broken widget.
  it('renders nothing at all when progress is unavailable', () => {
    const { container } = render(<ProgressStrip progress={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not claim a percentage-complete for the product', () => {
    render(<ProgressStrip progress={{ tasksDone: 596, tasksTotal: 601, adrs: 16 }} />)
    expect(screen.queryByText(/99%|complete/i)).not.toBeInTheDocument()
  })

  // ProgressScanner counts every `- [ ]` line — steps, not tasks (one plan task here spans
  // several checkbox steps). "plan tasks" overstates by roughly an order of magnitude on a
  // page whose whole standard is literal truth — see the spec's own ground-truth row, which
  // calls these "plan checkboxes".
  it('labels the ratio as plan checkboxes, not plan tasks', () => {
    render(<ProgressStrip progress={{ tasksDone: 596, tasksTotal: 601, adrs: 16 }} />)
    expect(screen.getByText(/plan checkboxes/i)).toBeInTheDocument()
    expect(screen.queryByText(/plan tasks/i)).not.toBeInTheDocument()
  })
})
