import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

// ─── Registry data layer (Task 13) ──────────────────────────────────────────
//
// `GET /api/registry` (Task 12) is the searchable authoring inventory backing
// `RegistrySearch`: every source table, target table, and DDL table name
// referenced across the live recipe corpus, plus the corpus's layers. Mirrors
// `useIpcRules()` (`queries.ts`) exactly — same `apiGet` call shape, same
// `staleTime: Infinity` — because the registry, like the IPC catalogue, is
// static per backend build; there is no write path that could make a cached
// copy stale within one running session.

export type Registry = components['schemas']['RegistryDto']
export type RegistryTable = components['schemas']['RegistryTableDto']

export const useRegistry = () =>
  useQuery({ queryKey: ['registry'], queryFn: () => apiGet<Registry>('/registry'), staleTime: Infinity })
