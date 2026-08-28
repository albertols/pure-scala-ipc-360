import { describe, expect, it } from 'vitest'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  // Item 1: `main.tsx` was a bare `new QueryClient()`, so React Query v5's
  // `refetchOnWindowFocus: true` default applied. Task 12 keeps every visited tab MOUNTED, so
  // their query observers stay active — one alt-tab back therefore refetched all four tabs at
  // once, including Tab 4's full unscoped `/api/relationships` and Tab 3's summary. The whole
  // point of this sub-project is that those payloads are requested deliberately, not by
  // regaining focus.
  it('does not refetch every mounted tab when the window regains focus', () => {
    const defaults = createQueryClient().getDefaultOptions()
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
  })
})
