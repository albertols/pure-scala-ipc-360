import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useResizableLayout, LAYOUT_DEFAULT, LAYOUT_MIN, LAYOUT_STORAGE_KEY } from './useResizableLayout'

describe('useResizableLayout', () => {
  beforeEach(() => localStorage.clear())

  it('starts at the defaults when nothing is stored', () => {
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
  })

  it('clamps below the minimum rather than accepting it', () => {
    const { result } = renderHook(() => useResizableLayout())
    act(() => result.current.setSize('canvasH', 10))
    expect(result.current.sizes.canvasH).toBe(LAYOUT_MIN.canvasH)
  })

  it('persists across a remount', () => {
    const first = renderHook(() => useResizableLayout())
    act(() => first.result.current.setSize('inspectorW', 420))
    first.unmount()
    const second = renderHook(() => useResizableLayout())
    expect(second.result.current.sizes.inspectorW).toBe(420)
  })

  it('survives corrupt stored JSON by falling back to defaults', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not json')
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
  })

  it('completes a partial stored object from the defaults', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ inspectorW: 500 }))
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual({ ...LAYOUT_DEFAULT, inspectorW: 500 })
  })

  it('drops a non-numeric stored value and falls back to the default for that key', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ canvasH: 'tall', inspectorW: 500 }))
    const { result } = renderHook(() => useResizableLayout())
    expect(result.current.sizes).toEqual({ ...LAYOUT_DEFAULT, inspectorW: 500 })
  })

  it('resetSizes returns to defaults and clears storage', () => {
    const { result } = renderHook(() => useResizableLayout())
    act(() => result.current.setSize('canvasH', 700))
    act(() => result.current.resetSizes())
    expect(result.current.sizes).toEqual(LAYOUT_DEFAULT)
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
  })
})
