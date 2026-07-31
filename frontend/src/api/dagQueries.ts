import { useQueries } from '@tanstack/react-query'
import { apiGet } from './client'
import type { OperationalSnapshot } from './queries'
import type { B15RowT } from './dagAdapter'

export interface SnapshotsResult { rowsByDate: Record<string, B15RowT[] | undefined>; isLoading: boolean }

export function useOperationalSnapshots(dates: string[]): SnapshotsResult {
  return useQueries({
    queries: dates.map(date => ({
      queryKey: ['operational', date] as const,           // shares cache with useOperational
      queryFn: () => apiGet<OperationalSnapshot>(`/operational/${date}`),
      staleTime: 30_000,
    })),
    combine: results => ({
      rowsByDate: Object.fromEntries(results.map((r, i) => [dates[i], r.data?.rows as B15RowT[] | undefined])),
      isLoading: results.some(r => r.isLoading),
    }),
  })
}
