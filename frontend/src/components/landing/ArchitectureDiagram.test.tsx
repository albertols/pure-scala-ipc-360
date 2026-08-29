import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { TABS } from '../../tabs'

afterEach(cleanup)

describe('ArchitectureDiagram', () => {
  it('renders the pipeline stages', () => {
    render(<ArchitectureDiagram onEnter={() => {}} />)

    expect(screen.getByText(/Powermart XML/i)).toBeInTheDocument()
    expect(screen.getByText(/parser/i)).toBeInTheDocument()
    expect(screen.getByText(/backend/i)).toBeInTheDocument()
    expect(screen.getByText(/frontend/i)).toBeInTheDocument()
  })

  // Every clickable region must route somewhere real — a dead region is worse than a static image.
  it('every clickable region maps to a real tab id', () => {
    const onEnter = vi.fn()
    render(<ArchitectureDiagram onEnter={onEnter} />)
    const validIds = new Set(TABS.map(t => t.id))

    const regions = screen.getAllByRole('button')
    expect(regions.length).toBeGreaterThan(0)

    for (const r of regions) {
      onEnter.mockClear()
      fireEvent.click(r)
      expect(onEnter).toHaveBeenCalledTimes(1)
      expect(validIds.has(onEnter.mock.calls[0][0])).toBe(true)
    }
  })

  it('routes the recipes region to the modifier and the b15 region to operational', () => {
    const onEnter = vi.fn()
    render(<ArchitectureDiagram onEnter={onEnter} />)

    fireEvent.click(screen.getByRole('button', { name: /recipes/i }))
    expect(onEnter).toHaveBeenCalledWith('modifier')

    onEnter.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /b15|operational/i }))
    expect(onEnter).toHaveBeenCalledWith('operational')
  })

  it('gives every region an accessible name', () => {
    render(<ArchitectureDiagram onEnter={() => {}} />)
    for (const r of screen.getAllByRole('button')) {
      expect(r).toHaveAccessibleName()
    }
  })

  // Hard constraint 3: a primary navigation affordance must be operable by keyboard,
  // not mouse-only — every region is a real tab stop that activates on Enter and Space.
  it('is reachable and operable by keyboard: Tab focuses a region, Enter and Space activate it', () => {
    const onEnter = vi.fn()
    render(<ArchitectureDiagram onEnter={onEnter} />)
    const regions = screen.getAllByRole('button')

    for (const r of regions) {
      expect((r as HTMLElement).tabIndex).toBe(0)
    }

    const recipesRegion = screen.getByRole('button', { name: /recipes/i })
    recipesRegion.focus()
    expect(recipesRegion).toHaveFocus()

    fireEvent.keyDown(recipesRegion, { key: 'Enter' })
    expect(onEnter).toHaveBeenCalledWith('modifier')

    onEnter.mockClear()
    fireEvent.keyDown(recipesRegion, { key: ' ' })
    expect(onEnter).toHaveBeenCalledWith('modifier')
  })

  // The diagram as a whole is a non-decorative graphic (it conveys real architecture,
  // not decoration) and must carry a text alternative; per-icon glyphs are decorative
  // duplicates of an adjacent text label and must be hidden from assistive tech instead
  // of announced as meaningless shapes. It must NOT be `role="img"`: ARIA's "children
  // presentational" rule for `img` would silence the five `role="button"` regions nested
  // inside it, leaving them keyboard-focusable but announced with no role or name.
  it('carries a text alternative for the whole diagram, hides decorative glyphs, and does not silence its nested buttons', () => {
    const { container } = render(<ArchitectureDiagram onEnter={() => {}} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toHaveAttribute('role', 'img')
    expect(svg).toHaveAttribute('role', 'group')

    const title = svg?.querySelector('title')
    expect(title).toBeTruthy()
    expect(title?.textContent ?? '').toMatch(/architecture/i)
    expect(title).toHaveAttribute('id', svg?.getAttribute('aria-labelledby'))

    const hiddenNodes = container.querySelectorAll('[aria-hidden="true"]')
    expect(hiddenNodes.length).toBeGreaterThan(0)

    // The nested regions must still expose their own role/name — proving `role="group"`
    // (unlike `role="img"`) does not swallow them.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
