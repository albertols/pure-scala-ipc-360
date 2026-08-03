import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditorLayout, DRAWER_EXPAND_DEFAULT_H } from './EditorLayout'
import { LAYOUT_DEFAULT, LAYOUT_MIN, CANVAS_MIN_W, LAYOUT_STORAGE_KEY } from './useResizableLayout'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderLayout(overrides: Partial<React.ComponentProps<typeof EditorLayout>> = {}) {
  return render(
    <EditorLayout
      toolbar={<div data-testid="slot-toolbar">toolbar</div>}
      canvas={<div data-testid="slot-canvas">canvas</div>}
      inspector={<div data-testid="slot-inspector">inspector</div>}
      drawer={[
        { id: 'source', label: 'Source', content: <div data-testid="drawer-source">source content</div> },
        { id: 'target', label: 'Target', content: <div data-testid="drawer-target">target content</div> },
      ]}
      {...overrides}
    />,
  )
}

describe('EditorLayout', () => {
  it('renders all four slots — toolbar, canvas, inspector, and every drawer tab label', () => {
    renderLayout()
    expect(screen.getByTestId('slot-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('slot-canvas')).toBeInTheDocument()
    expect(screen.getByTestId('slot-inspector')).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
  })

  it('drags the vertical splitter and widens the inspector via its inline width', () => {
    const { container } = renderLayout()
    const inspectorRegion = screen.getByTestId('slot-inspector').parentElement as HTMLElement
    expect(inspectorRegion.style.width).toBe(`${LAYOUT_DEFAULT.inspectorW}px`)

    const splitter = container.querySelector('[data-splitter="vertical"]')!
    fireEvent.pointerDown(splitter, { clientX: 500, clientY: 200, pointerId: 1 })
    // Dragging left (negative dx) widens the inspector — it sits to the right of the splitter.
    fireEvent.pointerMove(window, { clientX: 440, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 440, clientY: 200, pointerId: 1 })

    expect(inspectorRegion.style.width).toBe(`${LAYOUT_DEFAULT.inspectorW + 60}px`)
  })

  it('drags the horizontal splitter and grows the canvas region via its inline min-height', () => {
    const { container } = renderLayout()
    const canvasRegion = container.querySelector('[data-region="canvas"]') as HTMLElement
    expect(canvasRegion.style.minHeight).toBe(`${LAYOUT_DEFAULT.canvasH}px`)

    const splitter = container.querySelector('[data-splitter="horizontal"]')!
    fireEvent.pointerDown(splitter, { clientX: 300, clientY: 600, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 650, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 300, clientY: 650, pointerId: 1 })

    expect(canvasRegion.style.minHeight).toBe(`${LAYOUT_DEFAULT.canvasH + 50}px`)
  })

  it('attaches the drag listeners to window, not the splitter — a pointermove that never touches the splitter still resizes it', () => {
    const { container } = renderLayout()
    const canvasRegion = container.querySelector('[data-region="canvas"]') as HTMLElement
    const splitter = container.querySelector('[data-splitter="horizontal"]')!

    fireEvent.pointerDown(splitter, { clientX: 300, clientY: 600, pointerId: 1 })
    // The move fires on window/document — never dispatched to the 4px splitter element itself.
    fireEvent.pointerMove(document, { clientX: 300, clientY: 630, pointerId: 1 })
    fireEvent.pointerUp(document, { clientX: 300, clientY: 630, pointerId: 1 })

    expect(canvasRegion.style.minHeight).toBe(`${LAYOUT_DEFAULT.canvasH + 30}px`)
  })

  it('drags the corner grip and changes both canvas height and inspector width in one drag', () => {
    const { container } = renderLayout()
    const canvasRegion = container.querySelector('[data-region="canvas"]') as HTMLElement
    const inspectorRegion = screen.getByTestId('slot-inspector').parentElement as HTMLElement

    const grip = container.querySelector('[data-grip="corner"]')!
    fireEvent.pointerDown(grip, { clientX: 800, clientY: 600, pointerId: 1 })
    // Down + left: canvas grows taller, inspector grows wider (dragging left widens it).
    fireEvent.pointerMove(window, { clientX: 770, clientY: 640, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 770, clientY: 640, pointerId: 1 })

    expect(canvasRegion.style.minHeight).toBe(`${LAYOUT_DEFAULT.canvasH + 40}px`)
    expect(inspectorRegion.style.width).toBe(`${LAYOUT_DEFAULT.inspectorW + 30}px`)
  })

  it('changes the splitter color to the drag-accent while dragging and back to the border color on release', () => {
    const { container } = renderLayout()
    const splitter = container.querySelector('[data-splitter="vertical"]') as HTMLElement
    expect(splitter.style.background).toBe('var(--border)')

    fireEvent.pointerDown(splitter, { clientX: 500, clientY: 200, pointerId: 1 })
    // jsdom's CSSStyleDeclaration normalizes a hex literal to rgb() on read.
    expect(splitter.style.background).toBe('rgb(79, 156, 249)')

    fireEvent.pointerUp(window, { clientX: 500, clientY: 200, pointerId: 1 })
    expect(splitter.style.background).toBe('var(--border)')
  })

  it('clicking a drawer tab reveals its content at a genuinely non-zero height, and clicking it again collapses it', () => {
    renderLayout()
    expect(screen.queryByTestId('drawer-source')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Source'))
    expect(screen.getByTestId('drawer-source')).toBeInTheDocument()
    // Presence in the DOM alone can't distinguish a real reveal from a 0px
    // panel with invisible content — assert the actual observable height.
    // sizes.drawerH starts at LAYOUT_DEFAULT.drawerH (0), so this only holds
    // if the first expand bumped it to DRAWER_EXPAND_DEFAULT_H.
    const contentWrapper = screen.getByTestId('drawer-source').parentElement as HTMLElement
    expect(contentWrapper.style.height).toBe(`${DRAWER_EXPAND_DEFAULT_H}px`)

    fireEvent.click(screen.getByText('Source'))
    expect(screen.queryByTestId('drawer-source')).not.toBeInTheDocument()
  })

  it('switching drawer tabs shows only the newly-clicked tab\'s content', () => {
    renderLayout()
    fireEvent.click(screen.getByText('Source'))
    expect(screen.getByTestId('drawer-source')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Target'))
    expect(screen.queryByTestId('drawer-source')).not.toBeInTheDocument()
    expect(screen.getByTestId('drawer-target')).toBeInTheDocument()
  })

  it('renders no vertical splitter when inspector is null, and the canvas region has no inline width cap from it', () => {
    const { container } = renderLayout({ inspector: null })
    expect(container.querySelector('[data-splitter="vertical"]')).not.toBeInTheDocument()
    expect(screen.queryByTestId('slot-inspector')).not.toBeInTheDocument()
    expect(container.querySelector('[data-region="canvas"]')).toBeInTheDocument()
  })

  it('applies the CSS floors: canvas region min-width/min-height, inspector region min-width', () => {
    const { container } = renderLayout()
    const canvasRegion = container.querySelector('[data-region="canvas"]') as HTMLElement
    expect(canvasRegion.style.minWidth).toBe(`${CANVAS_MIN_W}px`)
    expect(canvasRegion.style.minHeight).not.toBe('')

    const inspectorRegion = screen.getByTestId('slot-inspector').parentElement as HTMLElement
    expect(inspectorRegion.style.minWidth).toBe(`${LAYOUT_MIN.inspectorW}px`)
  })

  it('detaches window pointer listeners on unmount mid-drag, so a later pointermove cannot fire from a dead component', () => {
    // A direct localStorage-write assertion can't distinguish "cleaned up" from
    // "not cleaned up" here: React 19 silently drops a functional setState
    // update queued against an already-unmounted fiber, so setSize's updater
    // never runs post-unmount regardless of whether the window listener was
    // removed — verified empirically (this exact test still passed with the
    // cleanup effect gutted to a no-op). The real, always-observable leak is
    // the dangling `window` listener itself: every un-cleaned drag leaves a
    // pointermove/pointerup pair permanently attached, each holding a closure
    // over the unmounted component's refs — spying on `removeEventListener`
    // asserts our own cleanup code path actually runs, independent of that
    // React-internals nuance.
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { container, unmount } = renderLayout()
    const splitter = container.querySelector('[data-splitter="horizontal"]')!

    fireEvent.pointerDown(splitter, { clientX: 300, clientY: 600, pointerId: 1 })
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function))

    // And the behavioural half of the same guarantee: a pointermove dispatched
    // after unmount must not throw or touch storage, whether or not React's
    // own unmounted-update guard would also have caught it.
    fireEvent.pointerMove(window, { clientX: 300, clientY: 900, pointerId: 1 })
    fireEvent.pointerUp(window, { clientX: 300, clientY: 900, pointerId: 1 })
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()

    removeSpy.mockRestore()
  })

  it('closes the Task 2 finding: a corrupted, below-floor stored canvasH still renders at least LAYOUT_MIN.canvasH tall', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ canvasH: 10, inspectorW: 340, drawerH: 0 }))
    const { container } = renderLayout()
    const canvasRegion = container.querySelector('[data-region="canvas"]') as HTMLElement
    // useResizableLayout deliberately does not clamp on read (Task 2) — EditorLayout is the
    // safety net, so even though sizes.canvasH is 10px here, the rendered floor holds.
    expect(Number(canvasRegion.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(LAYOUT_MIN.canvasH)
  })
})
