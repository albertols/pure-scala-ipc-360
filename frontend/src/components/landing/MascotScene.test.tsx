import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MascotScene } from './MascotScene'

afterEach(cleanup)

describe('MascotScene', () => {
  it('renders the relaxed scene when everything resolved', () => {
    render(<MascotScene status="ok" failingRoot={null} />)

    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'ok')
    expect(screen.getByTestId('overlay-bubbles')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay-twigs')).not.toBeInTheDocument()
  })

  it('renders the pruning scene when a root is unhealthy', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }} />)

    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded')
    expect(screen.getByTestId('overlay-twigs')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay-bubbles')).not.toBeInTheDocument()
  })

  // The mascot IS the readiness indicator — a degraded mood that does not say WHY
  // is just a sad picture. This is the whole point of binding it to diagnostics.
  it('names the failing root and its hint when degraded', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }} />)

    expect(screen.getByText(/composer/)).toBeInTheDocument()
    expect(screen.getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('degrades without a hint rather than rendering an empty callout', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: null }} />)

    expect(screen.getByText(/composer/)).toBeInTheDocument()
    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded')
  })

  it('always renders the hero image, in both moods', () => {
    const { rerender } = render(<MascotScene status="ok" failingRoot={null} />)
    expect(screen.getByRole('img', { name: /mascot/i })).toBeInTheDocument()

    rerender(<MascotScene status="degraded" failingRoot={{ name: 'corpus', hint: null }} />)
    expect(screen.getByRole('img', { name: /mascot/i })).toBeInTheDocument()
  })
})
