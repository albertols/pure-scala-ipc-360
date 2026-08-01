import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from './client'
import type { components } from './types.gen'

export type Layout = components['schemas']['LayoutDto']
export type NodeOffset = components['schemas']['NodeOffsetDto']

/** Node positions for a recipe. An unsaved layout is `{version:1,nodes:{}}`, never a 404 —
 * see LayoutService, so this hook has no "missing" state to handle. */
export const useLayout = (recipePath: string) =>
  useQuery({
    queryKey: ['layout', recipePath],
    queryFn: () => apiGet<Layout>(`/layouts/${recipePath}`),
    staleTime: 30_000,
    enabled: !!recipePath,
  })

export const putLayout = (recipePath: string, nodes: Record<string, { dx: number; dy: number }>) =>
  apiSend<Layout>('PUT', `/layouts/${recipePath}`, { version: 1, nodes })
