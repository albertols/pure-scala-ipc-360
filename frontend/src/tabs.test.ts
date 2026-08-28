import { describe, expect, it } from 'vitest'
import { TABS, FUTURE_TABS } from './tabs'
import type { TabId } from './types'

describe('tabs metadata', () => {
  it('describes all four live tabs, in strip order', () => {
    expect(TABS.map(t => t.id)).toEqual<TabId[]>(['viewer', 'modifier', 'operational', 'dag'])
  })

  it('gives every tab a label, an accent and a description the landing page can render', () => {
    for (const t of TABS) {
      expect(t.label).toBeTruthy()
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.icon).toBeTruthy()
    }
  })

  it('declares the two not-yet-built tabs', () => {
    expect(FUTURE_TABS.map(t => t.label)).toEqual(['ETL Tuner', 'ETL Agents'])
    for (const t of FUTURE_TABS) expect(t.desc).toBeTruthy()
  })
})
