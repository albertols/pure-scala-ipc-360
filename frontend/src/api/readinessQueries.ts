import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import { STALE_MS } from './queries'
import type { components } from './types.gen'

export type ReadinessT = components['schemas']['ReadinessDto']

/**
 * The landing page's single payload. One request rather than four coordinated fetches — four
 * loading states on the app's first screen is the wrong first impression.
 *
 * `staleTime: STALE_MS`, same as `useDiagnostics()` — NOT `Infinity`. `ReadinessService`
 * folds in live per-root health (`diagnostics.report()`, called fresh per request) alongside
 * the corpus/operational counts, so this is live-but-cheap data, not a fixed boot-time
 * snapshot. `Infinity` is reserved for catalogues that are static per backend build
 * (`useIpcRules()`, `useRegistry()`); readiness can change mid-session (a data root's tier
 * flipping, `operational.mode` switching) and must revalidate like `useDiagnostics()` does.
 */
export const useReadiness = () =>
  useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiGet<ReadinessT>('/readiness'),
    staleTime: STALE_MS,
  })
