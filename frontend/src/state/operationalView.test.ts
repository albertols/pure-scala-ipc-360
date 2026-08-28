import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOperationalView, setOperationalView, resetOperationalView, PERSISTED_KEYS } from './operationalView'

beforeEach(() => { localStorage.clear(); resetOperationalView() })
afterEach(() => { localStorage.clear() })

describe('operationalView', () => {
  it('starts with an empty selection and detailed density', () => {
    const { result } = renderHook(() => useOperationalView())
    expect(result.current.selectedClusters).toEqual([])
    expect(result.current.density).toBe('detailed')
    expect(result.current.selectedNode).toBeNull()
  })

  it('patches only the given keys', () => {
    const { result } = renderHook(() => useOperationalView())
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    expect(result.current.selectedClusters).toEqual(['cl-a'])
    expect(result.current.density).toBe('detailed')
  })

  it('notifies every subscriber', () => {
    const a = renderHook(() => useOperationalView())
    const b = renderHook(() => useOperationalView())
    act(() => setOperationalView({ zoom: 0.5 }))

    expect(a.result.current.zoom).toBe(0.5)
    expect(b.result.current.zoom).toBe(0.5)
  })

  // The point of the store: unmounting Tab 3 must not lose the view.
  it('survives an unmount and remount', () => {
    const first = renderHook(() => useOperationalView())
    act(() => setOperationalView({ selectedClusters: ['cl-a'], zoom: 1.4, selectedNode: 'recipe:x' }))
    first.unmount()

    const second = renderHook(() => useOperationalView())
    expect(second.result.current.selectedClusters).toEqual(['cl-a'])
    expect(second.result.current.zoom).toBe(1.4)
    expect(second.result.current.selectedNode).toBe('recipe:x')
  })

  it('persists only the durable preference keys', () => {
    renderHook(() => useOperationalView())
    act(() => setOperationalView({ density: 'minimal', paneWidth: 320, selectedClusters: ['cl-a'] }))

    const stored = JSON.parse(localStorage.getItem('etl360.tab3.view') ?? '{}')
    expect(Object.keys(stored).sort()).toEqual([...PERSISTED_KEYS].sort())
    expect(stored.density).toBe('minimal')
    expect(stored.selectedClusters).toBeUndefined()
  })

  it('rehydrates persisted preferences on first read', () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ density: 'compact', paneWidth: 300, paneCollapsed: true }))
    resetOperationalView()

    const { result } = renderHook(() => useOperationalView())
    expect(result.current.density).toBe('compact')
    expect(result.current.paneWidth).toBe(300)
    expect(result.current.paneCollapsed).toBe(true)
  })

  it('ignores corrupt persisted state rather than throwing', () => {
    localStorage.setItem('etl360.tab3.view', 'not json')
    resetOperationalView()

    expect(renderHook(() => useOperationalView()).result.current.density).toBe('detailed')
  })
})
