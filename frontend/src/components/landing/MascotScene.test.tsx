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
    render(
      <MascotScene
        status="degraded"
        failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }}
      />,
    )

    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded')
    expect(screen.getByTestId('overlay-twigs')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay-bubbles')).not.toBeInTheDocument()
  })

  // The mascot IS the readiness indicator — a degraded mood that does not say WHY
  // is just a sad picture. This is the whole point of binding it to diagnostics.
  it('names the failing root and its hint when degraded', () => {
    render(
      <MascotScene
        status="degraded"
        failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }}
      />,
    )

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

  // Regression guard for a defect the browser acceptance walk caught and no unit test could:
  // uncapped, the hero stretched to its flex parent's full 930px and pushed the "Enter ETL 360"
  // button to y=1120 in an 864px viewport — off-screen, on the one page whose promise is
  // click-and-go. jsdom computes no layout, so this pins the DECLARED cap rather than a measured
  // height; that is the honest limit of what a unit test can assert here.
  it('caps the hero so the call-to-action stays above the fold', () => {
    render(<MascotScene status="ok" failingRoot={null} />)
    const scene = screen.getByTestId('mascot-scene')

    // Width-capped, never height-capped: the inner box is aspectRatio 1/1 over an
    // objectFit:cover image, so a height cap would centre-crop the mascot's head off.
    expect(scene.style.maxWidth).toBe('min(600px, 52vh)')
    expect(scene.style.maxHeight).toBe('')
    // 600px is the asset's natural size — a larger cap would upscale and soften it.
    expect(scene.style.maxWidth).toContain('600px')
  })
})
