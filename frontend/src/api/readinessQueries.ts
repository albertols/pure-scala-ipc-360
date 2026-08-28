import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

export type ReadinessT = components['schemas']['ReadinessDto']

/**
 * The landing page's single payload. One request rather than four coordinated fetches — four
 * loading states on the app's first screen is the wrong first impression.
 *
 * `staleTime: Infinity` because readiness is a snapshot of how the app was configured at boot;
 * re-polling it while the user reads the page buys nothing and would refetch on window focus.
 */
export const useReadiness = () =>
  useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiGet<ReadinessT>('/readiness'),
    staleTime: Infinity,
  })
