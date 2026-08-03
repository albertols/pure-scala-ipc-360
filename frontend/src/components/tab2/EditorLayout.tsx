import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useResizableLayout, LAYOUT_MIN, CANVAS_MIN_W } from './useResizableLayout'

/** A drawer tab currently only ever gets expanded from a fully-collapsed rest
 * state (`LAYOUT_DEFAULT.drawerH` is 0, same as `LAYOUT_MIN.drawerH` — Task 2
 * gives this shell no other number to reach for). Rendering the freshly-
 * revealed content at literally 0px would make "reveals" a DOM-only fiction,
 * so the first expand nudges `drawerH` up to a usable height; every drag
 * after that is the user's own preference and is left alone. Exported so the
 * regression test can assert the exact observable height rather than merely
 * "not 0px" (which a partial fix could satisfy by accident). */
export const DRAWER_EXPAND_DEFAULT_H = 220

type SplitterKind = 'vertical' | 'horizontal' | 'corner'

const splitterRestColor = 'var(--border)'
const splitterDragColor = '#4f9cf9'

interface DragStart {
  clientX: number
  clientY: number
  canvasH: number
  inspectorW: number
}

export function EditorLayout(props: {
  toolbar: ReactNode
  canvas: ReactNode
  inspector: ReactNode | null
  drawer: { id: string; label: string; content: ReactNode }[]
}): React.ReactElement {
  const { toolbar, canvas, inspector, drawer } = props
  const { sizes, setSize } = useResizableLayout()
  const [dragging, setDragging] = useState<SplitterKind | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const dragStart = useRef<DragStart | null>(null)
  // The currently-attached window listeners for an in-progress drag, if any —
  // lets the unmount effect below detach them even when the gesture never
  // reaches its own pointerup (e.g. a tab switch unmounts EditorLayout while
  // a splitter is still held).
  const activeDragListeners = useRef<{ onMove: (ev: PointerEvent) => void; endDrag: () => void } | null>(null)
  // "Has the drawer ever been expanded", not "is sizes.drawerH currently at
  // its floor" — the latter would re-force-open a drawer the user just
  // dragged shut (once a later task wires up a drag control for drawerH).
  const hasExpandedDrawer = useRef(false)

  useEffect(() => {
    return () => {
      const listeners = activeDragListeners.current
      if (!listeners) return
      window.removeEventListener('pointermove', listeners.onMove)
      window.removeEventListener('pointerup', listeners.endDrag)
      activeDragListeners.current = null
    }
  }, [])

  // Drag math mirrors IpcCanvas's node-drag idiom (tab2/IpcCanvas.tsx): the
  // start size is captured once at pointerdown, and every move recomputes
  // the new size from that fixed start plus the accumulated client delta —
  // never from the previous move's (already-clamped) result, so a drag past
  // a floor and back doesn't drift. Unlike IpcCanvas, the move/up listeners
  // go on `window` rather than the dragged element: a splitter is 4px wide,
  // and a fast drag leaves that sliver within a single frame, which would
  // otherwise strand the gesture with the splitter stuck to the cursor.
  const beginDrag = useCallback(
    (kind: SplitterKind) => (e: React.PointerEvent) => {
      dragStart.current = { clientX: e.clientX, clientY: e.clientY, canvasH: sizes.canvasH, inspectorW: sizes.inspectorW }
      setDragging(kind)

      const onMove = (ev: PointerEvent) => {
        const start = dragStart.current
        if (!start) return
        const dx = ev.clientX - start.clientX
        const dy = ev.clientY - start.clientY
        // Vertical splitter/grip: the inspector sits to the right of the
        // dragged handle, so moving the handle left (negative dx) widens it.
        if (kind === 'vertical' || kind === 'corner') {
          setSize('inspectorW', start.inspectorW - dx)
        }
        // Horizontal splitter/grip: dragging down grows the canvas.
        if (kind === 'horizontal' || kind === 'corner') {
          setSize('canvasH', start.canvasH + dy)
        }
      }
      const endDrag = () => {
        dragStart.current = null
        setDragging(null)
        activeDragListeners.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', endDrag)
      }
      activeDragListeners.current = { onMove, endDrag }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', endDrag)
    },
    [sizes.canvasH, sizes.inspectorW, setSize],
  )

  const toggleDrawerTab = (id: string) => {
    setActiveTabId((current) => {
      if (current === id) return null
      if (!hasExpandedDrawer.current) {
        hasExpandedDrawer.current = true
        setSize('drawerH', DRAWER_EXPAND_DEFAULT_H)
      }
      return id
    })
  }

  const activeDrawer = drawer.find((tab) => tab.id === activeTabId) ?? null

  /** `kind` doubles as which axis this particular splitter drags (there is
   * exactly one splitter per axis; the corner grip drives both and has no
   * bar of its own to color). */
  const splitterStyle = (kind: 'vertical' | 'horizontal'): React.CSSProperties => ({
    flexShrink: 0,
    background: dragging === kind ? splitterDragColor : splitterRestColor,
    cursor: kind === 'vertical' ? 'col-resize' : 'row-resize',
    ...(kind === 'vertical' ? { width: 4 } : { height: 4 }),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>{toolbar}</div>

      <div style={{ display: 'flex', flex: 1, minHeight: LAYOUT_MIN.canvasH, overflow: 'hidden' }}>
        <div
          data-region="canvas"
          style={{
            // Task 4 finding: this region is a flex ITEM of the row above (so it
            // gets a real, stretched height), but its own CHILD is the opaque
            // `canvas` slot content — a block-display child of a block-display
            // parent does not inherit that stretched height (only flex/grid
            // parents stretch their own children). Without `display: 'flex'`
            // here too, a `canvas` slot wrapper following the sibling trap
            // warning verbatim (`{ display: 'flex', flex: 1, minHeight: 0 }`)
            // still collapses to 0px — the exact bug Task 7 of sub-project 8
            // fixed, recurring one level higher once real content (not the
            // placeholder `slot-canvas` div Task 3's own tests use) fills this
            // slot. See ETLModifier.tsx's own canvas wrapper for the other half
            // of this chain.
            display: 'flex',
            flex: 1,
            minWidth: CANVAS_MIN_W,
            // `sizes.canvasH` is what the horizontal splitter/corner grip
            // drive (dynamic — the drag tests assert on this value directly);
            // `LAYOUT_MIN.canvasH` is the constant floor closing the Task 2
            // finding, independent of the (unclamped-on-read) hook state, so
            // a corrupted stored value still can't render below the floor.
            minHeight: Math.max(sizes.canvasH, LAYOUT_MIN.canvasH),
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {canvas}
          <div
            data-grip="corner"
            onPointerDown={beginDrag('corner')}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 12,
              height: 12,
              cursor: 'nwse-resize',
              zIndex: 2,
            }}
          />
        </div>

        {inspector !== null && (
          <>
            <div data-splitter="vertical" onPointerDown={beginDrag('vertical')} style={splitterStyle('vertical')} />
            <div
              style={{
                width: sizes.inspectorW,
                minWidth: LAYOUT_MIN.inspectorW,
                flexShrink: 0,
                overflow: 'auto',
              }}
            >
              {inspector}
            </div>
          </>
        )}
      </div>

      <div data-splitter="horizontal" onPointerDown={beginDrag('horizontal')} style={splitterStyle('horizontal')} />

      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 2, padding: '2px 6px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {drawer.map((tab) => (
            <button
              key={tab.id}
              onClick={() => toggleDrawerTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '5px 9px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: activeTabId === tab.id ? '#c8d3e8' : '#4a5570',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeDrawer && (
          <div style={{ height: sizes.drawerH, overflow: 'auto' }}>{activeDrawer.content}</div>
        )}
      </div>
    </div>
  )
}
