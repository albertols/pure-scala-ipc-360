import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDockWidth } from './useDockWidth'

const KEY = 'etl360.test.dockW'
const BOUNDS = { dflt: 300, min: 240, max: 720 }

describe('useDockWidth', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the default when nothing is stored', () => {
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    expect(result.current.width).toBe(300)
  })

  it('restores a stored width', () => {
    localStorage.setItem(KEY, '480')
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    expect(result.current.width).toBe(480)
  })

  it('clamps a stored width that is out of bounds', () => {
    // Clamp on READ, not only on write: a bound can move between releases, and a value
    // stored under the old one would otherwise break the layout on every reload with no
    // in-app way out.
    localStorage.setItem(KEY, '5000')
    expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(720)
    localStorage.setItem(KEY, '10')
    expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(240)
  })

  it('ignores a stored value that is not a finite number', () => {
    // A hand-edited or schema-changed blob would otherwise flow straight into a CSS width.
    for (const bad of ['wide', 'NaN', '{"w":1}', '']) {
      localStorage.setItem(KEY, bad)
      expect(renderHook(() => useDockWidth(KEY, BOUNDS)).result.current.width).toBe(300)
    }
  })

  it('persists and clamps a new width', () => {
    const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
    act(() => result.current.setWidth(999))
    expect(result.current.width).toBe(720)
    expect(localStorage.getItem(KEY)).toBe('720')
  })

  it('survives storage being unavailable', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      const { result } = renderHook(() => useDockWidth(KEY, BOUNDS))
      act(() => result.current.setWidth(420))
      // Degrades to in-memory rather than throwing into the render tree.
      expect(result.current.width).toBe(420)
    } finally {
      Storage.prototype.setItem = real
    }
  })
})
