import { useCallback, useRef, useState } from 'react'

/**
 * A persisted, clamped width for a docked side panel.
 *
 * Modelled on `tab2/useResizableLayout.ts`, whose three defensive properties are the point:
 * a stored value that is not a finite number is IGNORED (a hand-edited or schema-changed blob
 * would otherwise flow straight into a CSS width); bounds are applied on READ as well as write
 * (a bound can move between releases, and a value stored under the old one would break the
 * layout on every reload with no in-app way out); and every storage call is guarded, so private
 * mode or an enterprise policy degrades to an in-memory width instead of throwing into render.
 *
 * No `reset` — unlike Tab 2's `useResizableLayout`, neither Tab 3 dock that consumes this ships
 * a reset affordance, so there is nothing to call it.
 */
export interface DockBounds {
  dflt: number
  min: number
  max: number
}

const clamp = (px: number, b: DockBounds) => Math.min(b.max, Math.max(b.min, px))

function read(key: string, b: DockBounds): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return b.dflt
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value)) return b.dflt
    return clamp(value, b)
  } catch {
    return b.dflt
  }
}

export function useDockWidth(
  storageKey: string,
  bounds: DockBounds,
): { width: number; setWidth: (px: number) => void } {
  const [width, setWidthState] = useState(() => read(storageKey, bounds))

  const setWidth = useCallback(
    (px: number) => {
      const next = clamp(px, bounds)
      setWidthState(next)
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        // Storage disabled — the width still applies for this session.
      }
    },
    [storageKey, bounds.min, bounds.max],
  )

  return { width, setWidth }
}

/**
 * The 4px grab strip on a right-hand dock's left edge.
 *
 * The drag math is `EditorLayout`'s idiom and both halves of it matter: the start width is
 * captured once at pointerdown and every move recomputes from that fixed start plus the
 * accumulated delta — never from the previous move's already-clamped result, so a drag past the
 * floor and back does not drift. The move/up listeners go on `window`, because a 4px strip is
 * trivially outrun by a fast pointer, which would otherwise strand the gesture.
 */
export function DockSplitter({
  width,
  onResize,
  testId = 'dock-splitter',
}: {
  width: number
  onResize: (px: number) => void
  testId?: string
}): React.ReactElement {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)

  const beginDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    start.current = { x: e.clientX, w: width }
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const s = start.current
      if (!s) return
      // The dock is on the RIGHT, so dragging left grows it.
      onResize(s.w - (ev.clientX - s.x))
    }
    const up = () => {
      start.current = null
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      data-testid={testId}
      data-splitter="dock"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      onPointerDown={beginDrag}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: dragging ? '#4f9cf9' : 'var(--border)',
      }}
    />
  )
}
