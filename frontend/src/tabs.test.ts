import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TABS, FUTURE_TABS } from './tabs'
import type { TabId } from './types'

// Pinned to the exact values in tabs.tsx (the Figma visual contract, ADR-0005) — a
// regex/length/truthy check cannot catch an accent swapped for a different valid hex,
// a reworded description, or an SVG geometry edit. This test locks the current values;
// it never restyles them.
const EXACT: Record<TabId, { accent: string; description: string; icon: string }> = {
  viewer: {
    accent: '#34d399',
    description:
      'Visualize Informatica PowerCenter XML mappings with an interactive node canvas. Click nodes to inspect ports, expressions, and properties.',
    icon:
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"></rect>' +
      '<rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"></rect>' +
      '<rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"></rect>' +
      '<rect x="8" y="8" width="5" height="5" rx="1.5" stroke="currentColor" stroke-width="1.3"></rect>' +
      '</svg>',
  },
  modifier: {
    accent: '#818cf8',
    description:
      'Edit _ETL_*.json recipe files — sources, transformations, expressions, and BigQuery DDL. All changes tracked with a save bar.',
    icon:
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<path d="M2 10.5V12h1.5l6-6L8 4.5l-6 6zM11.7 3.3a1 1 0 000-1.4l-.6-.6a1 1 0 00-1.4 0l-1 1L10.7 4.3l1-1z" stroke="currentColor" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>',
  },
  operational: {
    accent: '#fb923c',
    description:
      'Live relationship graph of tables and ETL recipes with BigQuery operational state — OK/KO, run history, p95 stats, and GCP deep links.',
    icon:
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<circle cx="3" cy="7" r="1.8" stroke="currentColor" stroke-width="1.3"></circle>' +
      '<circle cx="11" cy="3" r="1.8" stroke="currentColor" stroke-width="1.3"></circle>' +
      '<circle cx="11" cy="11" r="1.8" stroke="currentColor" stroke-width="1.3"></circle>' +
      '<line x1="4.8" y1="6.3" x2="9.2" y2="3.7" stroke="currentColor" stroke-width="1.2"></line>' +
      '<line x1="4.8" y1="7.7" x2="9.2" y2="10.3" stroke="currentColor" stroke-width="1.2"></line>' +
      '</svg>',
  },
  dag: {
    accent: '#4f9cf9',
    description:
      'Airflow DAG explorer with task dependency canvas, execution history, and one-click replay via GCP Pub/Sub.',
    icon:
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">' +
      '<path d="M1 7h3M10 7h3M4 7l2-3 2 3-2 3L4 7z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<circle cx="12" cy="7" r="1.3" fill="currentColor"></circle>' +
      '<circle cx="2" cy="7" r="1.3" fill="currentColor"></circle>' +
      '</svg>',
  },
}

describe('tabs metadata', () => {
  it('describes all four live tabs, in strip order', () => {
    expect(TABS.map(t => t.id)).toEqual<TabId[]>(['viewer', 'modifier', 'operational', 'dag'])
  })

  it('pins every tab to its exact accent, description and icon geometry', () => {
    for (const t of TABS) {
      const exact = EXACT[t.id]
      expect(t.label).toBeTruthy()
      expect(t.accent).toBe(exact.accent)
      expect(t.description).toBe(exact.description)
      expect(renderToStaticMarkup(t.icon)).toBe(exact.icon)
    }
  })

  it('declares the two not-yet-built tabs', () => {
    expect(FUTURE_TABS.map(t => t.label)).toEqual(['ETL Tuner', 'ETL Agents'])
    for (const t of FUTURE_TABS) expect(t.desc).toBeTruthy()
  })
})
