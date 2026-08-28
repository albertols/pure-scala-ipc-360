import { QueryClient } from '@tanstack/react-query'

/**
 * The app's single QueryClient.
 *
 * A factory rather than a `new QueryClient()` at the entry point, so the defaults are
 * assertable: a bare construction takes React Query v5's `refetchOnWindowFocus: true`, and
 * since Task 12 keeps every VISITED tab mounted (under `display: none`) their observers stay
 * active — one alt-tab back would refetch all four tabs at once, including Tab 4's full
 * unscoped `/api/relationships` and Tab 3's cluster-scoped summary. This whole sub-project is
 * about those payloads being requested deliberately; regaining focus is not a request.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
  })
}
