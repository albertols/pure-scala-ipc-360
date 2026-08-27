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

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
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
    queryFn: () => apiGet<RelationshipGraph>(
      `/relationships?${key.map(c => `clusters=${encodeURIComponent(c)}`).join('&')}`),
    staleTime: STALE_MS,
    enabled: key.length > 0,
  })
}

export interface RunsResult {
  byRecipe: Record<string, RunT[]>
  isLoading: boolean
}

/**
 * Run history for any number of recipes.
 *
 * `/api/operational/runs` is bounded at MAX_RECIPES_PER_REQUEST so one caller cannot relocate the
 * scale problem into it. A cluster or DAG can exceed that, so the list is chunked here — in ONE
 * place, rather than per tab — and the responses merged. The bound never reaches a user as a 400.
 */
export function useRuns(recipes: string[], limit = 10): RunsResult {
  const sorted = [...new Set(recipes)].sort()
  const groups = chunk(sorted, MAX_RECIPES_PER_REQUEST)

  return useQueries({
    queries: groups.map(group => ({
      queryKey: ['runs', limit, group.join(',')] as const,
      queryFn: () => apiGet<components['schemas']['RunsDto']>(
        `/operational/runs?limit=${limit}&${group.map(r => `recipe=${encodeURIComponent(r)}`).join('&')}`),
      staleTime: STALE_MS,
    })),
    combine: results => ({
      byRecipe: Object.assign({}, ...results.map(r => r.data?.byRecipe ?? {})) as Record<string, RunT[]>,
      isLoading: results.some(r => r.isLoading),
    }),
  })
}
