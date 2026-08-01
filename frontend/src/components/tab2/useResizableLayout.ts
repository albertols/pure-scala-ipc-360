import { useCallback, useState } from 'react'

export interface LayoutSizes {
  canvasH: number
  inspectorW: number
  drawerH: number
}

/** Minimums for the three RESIZABLE dimensions — keyed exactly by `LayoutSizes`, so
 * `setSize` can index it without a cast. */
export const LAYOUT_MIN: Record<keyof LayoutSizes, number> = {
  canvasH: 240,
  inspectorW: 280,
  drawerH: 0,
}

/** The canvas's minimum WIDTH is not resizable state — the canvas takes whatever the
 * inspector leaves — so it is a plain layout constant consumed by `EditorLayout`'s
 * `min-width`, deliberately kept out of `LayoutSizes`. */
export const CANVAS_MIN_W = 360

export const LAYOUT_DEFAULT: LayoutSizes = { canvasH: 520, inspectorW: 340, drawerH: 0 }

export const LAYOUT_STORAGE_KEY = 'etl360.tab2.layout'

function readStoredSizes(): LayoutSizes {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return LAYOUT_DEFAULT
    const parsed = JSON.parse(raw) as Partial<LayoutSizes>
    return { ...LAYOUT_DEFAULT, ...parsed }
  } catch {
    return LAYOUT_DEFAULT
  }
}

function writeStoredSizes(sizes: LayoutSizes): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(sizes))
  } catch {
    // Storage disabled (private mode, enterprise policy) — degrade to in-memory sizes.
  }
}

function clearStoredSizes(): void {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
  } catch {
    // Storage disabled — nothing to clear.
  }
}

export function useResizableLayout(): {
  sizes: LayoutSizes
  setSize: (key: keyof LayoutSizes, px: number) => void
  resetSizes: () => void
} {
  const [sizes, setSizes] = useState<LayoutSizes>(readStoredSizes)

  const setSize = useCallback((key: keyof LayoutSizes, px: number) => {
    setSizes((prev) => {
      const next = { ...prev, [key]: Math.max(LAYOUT_MIN[key], px) }
      writeStoredSizes(next)
      return next
    })
  }, [])

  const resetSizes = useCallback(() => {
    clearStoredSizes()
    setSizes(LAYOUT_DEFAULT)
  }, [])

  return { sizes, setSize, resetSizes }
}
