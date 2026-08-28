export interface CanvasView { zoom: number; pan: { x: number; y: number } }

export interface WheelInput {
  deltaX: number
  deltaY: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  /** Pointer position relative to the canvas container's top-left, in screen pixels. */
  cursor: { x: number; y: number }
}

const MIN_ZOOM = 0.3  // matches the +/- buttons and fitToViewport's clamp — one floor, everywhere.
const MAX_ZOOM = 2
const ZOOM_RATE = 0.002

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** True when the canvas will act on this wheel event — the only case that should preventDefault. */
export function wheelActs(input: WheelInput): boolean {
  return input.deltaX !== 0 || input.deltaY !== 0
}

/**
 * cmd/ctrl+wheel zooms about the cursor, shift+wheel pans horizontally, a plain wheel pans
 * vertically. Trackpad pinch arrives as ctrl+wheel, so pinch zoom works with no extra handling.
 *
 * Cursor-anchored zoom: the graph coordinate under the pointer is `(cursor - pan) / zoom`, and the
 * pan is corrected so that value is unchanged after the scale.
 */
export function applyWheel(view: CanvasView, input: WheelInput): CanvasView {
  if (input.metaKey || input.ctrlKey) {
    const zoom = clamp(view.zoom * Math.exp(-input.deltaY * ZOOM_RATE), MIN_ZOOM, MAX_ZOOM)
    const k = zoom / view.zoom
    return {
      zoom,
      pan: {
        x: input.cursor.x - k * (input.cursor.x - view.pan.x),
        y: input.cursor.y - k * (input.cursor.y - view.pan.y),
      },
    }
  }
  if (input.shiftKey) {
    return { zoom: view.zoom, pan: { x: view.pan.x - (input.deltaY || input.deltaX), y: view.pan.y } }
  }
  return {
    zoom: view.zoom,
    pan: { x: view.pan.x - input.deltaX, y: view.pan.y - input.deltaY },
  }
}
