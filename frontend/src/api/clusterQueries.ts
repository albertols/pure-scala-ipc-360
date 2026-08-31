import { useQueries, useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'
import type { RelationshipGraph } from './queries'

export type ClusterIndexT = components['schemas']['ClusterIndexDto']
export type ClusterSummaryT = components['schemas']['ClusterSummaryDto']
export type ClusterDetailT = components['schemas']['ClusterDetailDto']
export type RecipeInClusterT = components['schemas']['RecipeInClusterDto']
export type RunT = components['schemas']['RunDto']

const STALE_MS = 30_000

/** Mirrors ClusterController.MAX_RECIPES. Kept here so the bound is enforced before the request. */
export const MAX_RECIPES_PER_REQUEST = 200

/**
 * Budget, in bytes, for the `/api/operational/runs` QUERY STRING.
 *
 * The binding limit on a repeated-`recipe=` request is not the recipe COUNT, it is the size of
 * the request line: Spring Boot's `server.max-http-header-size` defaults to 8 KB and Tomcat
 * rejects an over-long request with a raw 400 before the application is entered — so it never
 * even reaches the app's ProblemDetail handler. Measured against this backend with real corpus
 * recipe names: 165 names = 8 003 B => 200; 170 names = 8 196 B => 400; 200 names = 9 608 B => 400.
 * The corpus's mean recipe filename is ~40 chars, i.e. ~48 B per `&recipe=` pair, so a
 * count-only 200-recipe chunk is ALWAYS over the limit — every cluster or DAG above ~166
 * recipes lost its run history entirely.
 *
 * 6 KB, not 8: the rest of the request line, `Host`, `Accept`, `Cookie` and any tracing headers
 * are inside the same 8 KB, and a reverse proxy in front of a real deployment enforces its own
 * (also typically 8 KB) limit — raising the server setting would only move the cliff, not
 * remove it.
 */
export const QUERY_BUDGET_BYTES = 6000

/** `&recipe=` — the per-recipe wire overhead the budget has to account for alongside the name. */
const RECIPE_PARAM_BYTES = '&recipe='.length

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** The one place a runs query string is built — so the chunker below measures exactly what is sent. */
export function runsQuery(recipes: string[], limit: number): string {
  return [`limit=${limit}`, ...recipes.map(r => `recipe=${encodeURIComponent(r)}`)].join('&')
}

/**
 * Splits a recipe list into chunks that satisfy BOTH bounds simultaneously: the accumulated
 * encoded query-string size stays within {@link QUERY_BUDGET_BYTES}, and the count stays within
 * {@link MAX_RECIPES_PER_REQUEST} (the server's own declared limit). With realistic names the
 * byte bound is the one that bites first (~124 per chunk); with short names the count bound is.
 *
 * A single name that exceeds the whole budget on its own still gets its own chunk — dropping it
 * would be a silent loss of that recipe's history, which is the failure mode this replaces.
 */
export function chunkRecipes(
  recipes: string[],
  limit: number,
  budget = QUERY_BUDGET_BYTES,
  maxCount = MAX_RECIPES_PER_REQUEST,
): string[][] {
  const base = `limit=${limit}`.length
  const out: string[][] = []
  let current: string[] = []
  let size = base
  for (const recipe of recipes) {
    const cost = RECIPE_PARAM_BYTES + encodeURIComponent(recipe).length
    if (current.length > 0 && (current.length >= maxCount || size + cost > budget)) {
      out.push(current)
      current = []
      size = base
    }
    current.push(recipe)
    size += cost
  }
  if (current.length > 0) out.push(current)
  return out
}

export const useClusterIndex = () =>
  useQuery({
    queryKey: ['clusterIndex'],
    queryFn: () => apiGet<ClusterIndexT>('/operational/clusters'),
    staleTime: STALE_MS,
  })

export const useClusterDetail = (name: string | null) =>
  useQuery({
    queryKey: ['clusterDetail', name],
    queryFn: () => apiGet<ClusterDetailT>(`/operational/clusters/${encodeURIComponent(name!)}`),
    staleTime: STALE_MS,
    enabled: !!name,
  })

/** Scoped graph. An empty cluster list fetches nothing — the empty canvas costs no request. */
export const useScopedRelationships = (clusters: string[]) => {
  const key = [...clusters].sort()
  return useQuery({
    queryKey: ['relationships', 'scoped', key.join(',')],
    queryFn: () =>
      apiGet<RelationshipGraph>(
        `/relationships?${key.map(c => `clusters=${encodeURIComponent(c)}`).join('&')}`,
      ),
    staleTime: STALE_MS,
    enabled: key.length > 0,
  })
}

/** One hit from `GET /api/operational/search` — a recipe or table, and the clusters reaching it. */
export interface SearchHitT {
  kind: 'recipe' | 'table'
  name: string
  layer: string
  clusters: string[]
}

export interface SearchHitsT {
  hits: SearchHitT[]
  truncated: boolean
}

/** The minimum the backend will act on; below it the endpoint returns empty rather than erroring. */
export const SEARCH_MIN_Q = 2

/**
 * Cross-index search over the whole b15 history AND the relationships graph.
 *
 * Distinct from Tab 3's toolbar input, which filters the cards already on the canvas: this finds
 * things in clusters that have not been loaded, which is the only way to answer "which cluster
 * runs this table?" without guessing. Table names are not in the b15 index at all, so this
 * cannot be done client-side (ADR-0019).
 */
export const useOperationalSearch = (q: string) => {
  const needle = q.trim()
  return useQuery({
    queryKey: ['operationalSearch', needle],
    queryFn: () => apiGet<SearchHitsT>(`/operational/search?q=${encodeURIComponent(needle)}`),
    staleTime: STALE_MS,
    enabled: needle.length >= SEARCH_MIN_Q,
  })
}

/** One node on a lineage; `hop` is signed — negative upstream, 0 the seed, positive downstream. */
export interface LineageNodeT {
  id: string
  kind: 'recipe' | 'table'
  name: string
  layer: string
  hop: number
  clusters: string[]
}

export interface LineageT {
  seed: string
  nodes: LineageNodeT[]
  edges: { from: string; to: string; kind: 'source' | 'lookup' | 'writes' }[]
  truncated: boolean
  totalReachable: number
}

export const LINEAGE_DEFAULT_LIMIT = 150
export const LINEAGE_MAX_LIMIT = 600

/**
 * One node's transitive lineage. NOT cluster-scoped by design — lineage crosses cluster
 * boundaries, and stopping at the selection would draw a complete-looking flow that is not one
 * (ADR-0020). Bounded by node count instead, which is what keeps it a purposeful slice.
 */
export const useLineage = (nodeId: string | null, limit: number = LINEAGE_DEFAULT_LIMIT) =>
  useQuery({
    queryKey: ['lineage', nodeId, limit],
    queryFn: () =>
      apiGet<LineageT>(`/operational/lineage?node=${encodeURIComponent(nodeId!)}&limit=${limit}`),
    staleTime: STALE_MS,
    enabled: !!nodeId,
  })

export interface RunsResult {
  byRecipe: Record<string, RunT[]>
  isLoading: boolean
  /**
   * True if ANY chunk failed. A failed chunk's recipes are simply absent from
   * `byRecipe` (Object.assign only ever sees `.data`, never an error) — indistinguishable
   * from "no runs" unless a caller checks this. Surviving chunks' recipes remain in
   * `byRecipe`: partial data is still useful, it just must not be mistaken for complete data.
   */
  isError: boolean
}

/**
 * Run history for any number of recipes.
 *
 * `/api/operational/runs` is bounded at MAX_RECIPES_PER_REQUEST so one caller cannot relocate the
 * scale problem into it, and the request line itself is bounded at 8 KB by the container. A
 * cluster or DAG can exceed either, so the list is chunked here — in ONE place, rather than per
 * tab, against BOTH bounds (see `chunkRecipes`) — and the responses merged. Neither bound ever
 * reaches a user as a 400.
 */
export function useRuns(recipes: string[], limit = 10): RunsResult {
  const sorted = [...new Set(recipes)].sort()
  const groups = chunkRecipes(sorted, limit)

  return useQueries({
    queries: groups.map(group => ({
      queryKey: ['runs', limit, group.join(',')] as const,
      queryFn: () =>
        apiGet<components['schemas']['RunsDto']>(`/operational/runs?${runsQuery(group, limit)}`),
      staleTime: STALE_MS,
    })),
    combine: results => ({
      byRecipe: Object.assign({}, ...results.map(r => r.data?.byRecipe ?? {})) as Record<
        string,
        RunT[]
      >,
      isLoading: results.some(r => r.isLoading),
      isError: results.some(r => r.isError),
    }),
  })
}
