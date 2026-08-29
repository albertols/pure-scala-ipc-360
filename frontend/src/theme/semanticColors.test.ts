import { describe, it, expect } from 'vitest'
import {
  LAYER_COLOR, KIND_PALETTE, layerColor, kindPalette, statusColor, statusBg,
} from './semanticColors'
import { LAYER_RANK } from '../api/relationshipsAdapter'

describe('layer palette', () => {
  it('groups the layers into the medallion tiers', () => {
    expect(layerColor('STG')).toBe(layerColor('ODS'))                 // bronze — raw
    expect(layerColor('DWH')).toBe(layerColor('ETL'))                 // silver — refined
    expect(layerColor('CDM')).toBe(layerColor('QDM'))                 // gold — curated
    expect(layerColor('CDM')).toBe(layerColor('RDM'))
  })

  it('keeps the four tiers mutually distinct', () => {
    const tiers = [layerColor('STG'), layerColor('DWH'), layerColor('CDM'), layerColor('OUTPUT')]
    expect(new Set(tiers).size).toBe(4)
  })

  it('covers every layer the adapter can rank — none falls through uncoloured', () => {
    // LAYER_RANK is the adapter's own enumeration of what can reach a card, so it is the honest
    // totality check: a layer added there without a colour here would render as "unresolved".
    for (const layer of Object.keys(LAYER_RANK)) {
      expect(LAYER_COLOR[layer], layer).toBeDefined()
    }
  })

  it('gives an unresolved layer a deliberately neutral colour', () => {
    // UNKNOWN is OperationalService's fallback when L2L cannot resolve a layer, so its
    // appearance is diagnostic information: it must not look like a fifth tier.
    expect(layerColor('UNKNOWN')).toBe('#4a5570')
    expect(layerColor('NOT_A_REAL_LAYER')).toBe(layerColor('UNKNOWN'))
    expect(layerColor('')).toBe(layerColor('UNKNOWN'))
  })
})

describe('kind palette', () => {
  it('puts the status bar on a different edge per kind', () => {
    // Kind stays readable from the GEOMETRY of the status bar, not hue alone.
    expect(kindPalette('table').statusEdge).toBe('top')
    expect(kindPalette('recipe').statusEdge).toBe('left')
  })

  it('uses the BigQuery and Spark product accents', () => {
    expect(kindPalette('table').accent).toBe('#4f9cf9')
    expect(kindPalette('recipe').accent).toBe('#fb923c')
  })

  it('never reuses a layer colour as a kind accent', () => {
    // THE defect this module fixes: the layer chip used to be coloured by KIND, so `CDM`
    // rendered blue on a table and amber on a recipe and neither colour meant "CDM".
    const layerColours = new Set(Object.values(LAYER_COLOR))
    expect(layerColours.has(KIND_PALETTE.table.accent)).toBe(false)
    expect(layerColours.has(KIND_PALETTE.recipe.accent)).toBe(false)
  })

  it('gives each kind a tint and a border derived from its own accent', () => {
    for (const kind of ['table', 'recipe'] as const) {
      const p = kindPalette(kind)
      expect(p.tint).toContain('rgba(')
      expect(p.border).toContain('rgba(')
      expect(p.tint).not.toBe(p.border)
    }
  })
})

describe('status palette', () => {
  it('keeps the shipped OK/KO/PENDING colours', () => {
    expect(statusColor('OK')).toBe('#34d399')
    expect(statusColor('KO')).toBe('#f87171')
    expect(statusColor('PENDING')).toBe('#4a5570')
    expect(statusColor('RUNNING')).toBe('#fbbf24')
  })

  it('falls back to PENDING for an unknown status rather than undefined', () => {
    expect(statusColor('WAT')).toBe(statusColor('PENDING'))
    expect(statusBg('WAT')).toBe(statusBg('PENDING'))
  })
})
