import type { OperationalCard } from '../../types'
import type { OperationalSummary } from '../../api/queries'
import type { RunT } from '../../api/clusterQueries'

// ─── viewScope — the cluster pane's two REFINEMENTS ──────────────────────────
//
// `ClusterPane`'s chevron reveals a recipe checkbox per recipe and a date checkbox per date, and
// spec §7.1 says both "further filter the canvas". They are refinements WITHIN an already-fetched
// cluster selection, not a new scope: the scoped graph, summary and run history for the selected
// clusters are already in hand, so narrowing them client-side is both correct and free — a
// refetch would cost a round trip to remove rows the browser is already holding.
//
// Two sentinels, both "no filter", both preserved exactly as `operationalView.ts` declares them:
// `deselectedRecipes` is the list of recipes explicitly UNCHECKED (empty = all of them), and
// `selectedDates` the list explicitly CHECKED (empty = every date). Each function below returns
// its input by reference in the no-filter case, so a `useMemo` downstream sees an unchanged
// identity and nothing re-renders when the feature is not in use.

/**
 * The cards minus the recipes the pane has unchecked. Edges need no separate handling: the
 * canvas draws only edges whose BOTH endpoints are in the rendered card set
 * (`ETLOperational.tsx`'s `visibleEdges`), so an edge touching a removed recipe drops with it.
 */
export function withoutDeselectedRecipes(
  cards: OperationalCard[],
  deselectedRecipes: string[],
): OperationalCard[] {
  if (deselectedRecipes.length === 0) return cards
  const out = new Set(deselectedRecipes)
  // `kind === 'recipe'` is load-bearing, not defensive: the pane lists recipe FILENAMES, and a
  // table card carrying the same string is a different node that was never unchecked.
  return cards.filter(c => !(c.kind === 'recipe' && out.has(c.name)))
}

/** Nearest-rank percentile — the same rule `OperationalService.nearestRank` uses server-side. */
function nearestRank(sortedAsc: number[], pct: number): number {
  const rank = Math.min(Math.max(1, Math.ceil((pct / 100) * sortedAsc.length)), sortedAsc.length)
  return sortedAsc[rank - 1]!
}

/**
 * The summary restricted to the checked dates.
 *
 * Every rollup field is RECOMPUTED from the narrowed history rather than carried over: the
 * counts, the latest date/status and the duration percentiles all describe a history, so keeping
 * the server's originals would make a card claim a KO on a date the operator has just filtered
 * out. A recipe left with no run on any checked date is dropped, which the adapter already reads
 * as PENDING — an honest "nothing known here" rather than a stale status.
 */
export function narrowSummaryToDates(
  summary: OperationalSummary | undefined,
  selectedDates: string[],
): OperationalSummary | undefined {
  if (!summary || selectedDates.length === 0) return summary
  const keep = new Set(selectedDates)

  const recipes = (summary.recipes ?? []).flatMap(recipe => {
    const history = (recipe.history ?? []).filter(h => h.date !== undefined && keep.has(h.date))
    if (history.length === 0) return []

    const durations = history
      .map(h => h.durationMin)
      .filter((d): d is number => d !== undefined && d !== null)
      .sort((a, b) => a - b)
    const last = history[history.length - 1]!

    return [
      {
        ...recipe,
        history,
        okCount: history.filter(h => h.status === 'SUCCESS').length,
        koCount: history.filter(h => h.status === 'FAILED').length,
        latestDate: last.date,
        latestStatus: last.status,
        avgDurationMin:
          durations.length === 0
            ? undefined
            : durations.reduce((a, b) => a + b, 0) / durations.length,
        p50DurationMin: durations.length === 0 ? undefined : nearestRank(durations, 50),
        p95DurationMin: durations.length === 0 ? undefined : nearestRank(durations, 95),
      },
    ]
  })

  return { dates: (summary.dates ?? []).filter(d => keep.has(d)), recipes }
}

/**
 * The chunked run history restricted to the checked dates. A recipe whose runs all fall outside
 * the filter keeps its key with an empty array — absent means `[]`, never missing, the same
 * shape rule `/api/operational/runs` itself keeps, so a caller cannot mistake "filtered out"
 * for "this recipe was never requested".
 */
export function narrowRunsToDates(
  byRecipe: Record<string, RunT[]>,
  selectedDates: string[],
): Record<string, RunT[]> {
  if (selectedDates.length === 0) return byRecipe
  const keep = new Set(selectedDates)
  const out: Record<string, RunT[]> = {}
  for (const [recipe, runs] of Object.entries(byRecipe)) {
    out[recipe] = runs.filter(r => r.date !== undefined && keep.has(r.date))
  }
  return out
}
