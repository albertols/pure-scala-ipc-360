import { describe, expect, it } from 'vitest'
import type { OperationalCard } from '../../types'
import type { OperationalSummary } from '../../api/queries'
import type { RunT } from '../../api/clusterQueries'
import { withoutDeselectedRecipes, narrowSummaryToDates, narrowRunsToDates } from './viewScope'

const card = (id: string, kind: 'recipe' | 'table', name: string): OperationalCard => ({
  id, kind, name, layer: 'STG', status: 'OK', lastRun: '1970-01-01T00:00:00Z',
  history: [], stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 }, relations: [],
})

const CARDS = [
  card('t_src', 'table', 'stg.SRC'),
  card('r_a', 'recipe', '_ETL_a.json'),
  card('r_b', 'recipe', '_ETL_b.json'),
  card('t_tgt', 'table', 'stg.TGT'),
]

describe('withoutDeselectedRecipes', () => {
  it('is the identity when nothing is unchecked', () => {
    expect(withoutDeselectedRecipes(CARDS, [])).toBe(CARDS)
  })

  it('drops exactly the unchecked recipe cards', () => {
    const kept = withoutDeselectedRecipes(CARDS, ['_ETL_a.json'])
    expect(kept.map(c => c.id)).toEqual(['t_src', 'r_b', 't_tgt'])
  })

  // A table is not a recipe: the pane's checkboxes list recipe filenames, and a table that
  // happens to share a name with one must not vanish with it.
  it('never drops a table, even one named like a deselected recipe', () => {
    const clash = [card('t_x', 'table', '_ETL_a.json'), card('r_a', 'recipe', '_ETL_a.json')]
    expect(withoutDeselectedRecipes(clash, ['_ETL_a.json']).map(c => c.id)).toEqual(['t_x'])
  })
})

const SUMMARY: OperationalSummary = {
  dates: ['2026-07-27', '2026-07-28', '2026-07-29'],
  recipes: [
    {
      recipeFilename: '_ETL_a.json', layer: 'STG',
      latestDate: '2026-07-29', latestStatus: 'FAILED', okCount: 2, koCount: 1,
      history: [
        { date: '2026-07-27', status: 'SUCCESS', durationMin: 1 },
        { date: '2026-07-28', status: 'SUCCESS', durationMin: 2 },
        { date: '2026-07-29', status: 'FAILED', durationMin: 3 },
      ],
      avgDurationMin: 2, p50DurationMin: 2, p95DurationMin: 3,
      lastJobId: 'app-29', lastClusterName: 'cl-a',
    },
  ],
}

describe('narrowSummaryToDates', () => {
  it('is the identity when no date is checked — the empty sentinel means "no filter"', () => {
    expect(narrowSummaryToDates(SUMMARY, [])).toBe(SUMMARY)
    expect(narrowSummaryToDates(undefined, ['2026-07-28'])).toBeUndefined()
  })

  it('keeps only the checked dates in the history', () => {
    const out = narrowSummaryToDates(SUMMARY, ['2026-07-27', '2026-07-28'])!
    expect(out.dates).toEqual(['2026-07-27', '2026-07-28'])
    expect(out.recipes![0]!.history!.map(h => h.date)).toEqual(['2026-07-27', '2026-07-28'])
  })

  // The rollup fields describe the history, so they have to describe the NARROWED one —
  // otherwise a card would show "1 KO" for a run on a date the user just filtered out.
  it('recomputes the rollup from the narrowed history, not the original', () => {
    const out = narrowSummaryToDates(SUMMARY, ['2026-07-27', '2026-07-28'])!
    const recipe = out.recipes![0]!
    expect(recipe.okCount).toBe(2)
    expect(recipe.koCount).toBe(0)
    expect(recipe.latestDate).toBe('2026-07-28')
    expect(recipe.latestStatus).toBe('SUCCESS')
  })

  it('recomputes the duration stats over the narrowed history only', () => {
    const out = narrowSummaryToDates(SUMMARY, ['2026-07-29'])!
    const recipe = out.recipes![0]!
    expect(recipe.avgDurationMin).toBe(3)
    expect(recipe.p50DurationMin).toBe(3)
    expect(recipe.p95DurationMin).toBe(3)
  })

  it('drops a recipe with no run on any checked date rather than reporting stale counts', () => {
    const out = narrowSummaryToDates(SUMMARY, ['2026-01-01'])!
    expect(out.recipes).toEqual([])
  })
})

const RUNS: Record<string, RunT[]> = {
  '_ETL_a.json': [
    { date: '2026-07-29', clusterName: 'cl-a', jobId: 'app-29', appStartIso: '', durationMin: 1, status: 'FAILED', message: '' },
    { date: '2026-07-28', clusterName: 'cl-a', jobId: 'app-28', appStartIso: '', durationMin: 1, status: 'SUCCESS', message: '' },
  ],
}

describe('narrowRunsToDates', () => {
  it('is the identity when no date is checked', () => {
    expect(narrowRunsToDates(RUNS, [])).toBe(RUNS)
  })

  it('keeps only the runs on checked dates, and keeps the recipe key when none survive', () => {
    expect(narrowRunsToDates(RUNS, ['2026-07-28'])['_ETL_a.json']!.map(r => r.jobId)).toEqual(['app-28'])
    // Absent means [], never missing — the same shape rule /api/operational/runs itself keeps.
    expect(narrowRunsToDates(RUNS, ['2026-01-01'])['_ETL_a.json']).toEqual([])
  })
})
