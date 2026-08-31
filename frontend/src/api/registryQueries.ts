import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

// ─── Registry data layer (Task 13) ──────────────────────────────────────────
//
// `GET /api/registry` (Task 12) is the searchable authoring inventory backing
// `RegistrySearch`: every source table, target table, and DDL table name
// referenced across the live recipe corpus, plus the corpus's layers. Mirrors
// `useIpcRules()` (`queries.ts`) exactly — same `apiGet` call shape, same
// `staleTime: Infinity`.
//
// Unlike the IPC catalogue, though, the registry is NOT static per backend
// build. It is derived from the corpus, and Tasks 14/15 gave Tab 2 the write
// paths that change it: `POST /api/recipes/{*path}` adds a whole recipe, and a
// `PUT` can rewrite `table.sourceTableNames`/`targetTableNames`. `staleTime:
// Infinity` is therefore load-bearing on an explicit invalidation rather than
// on immutability — `ETLModifier`'s `handleSave` invalidates `['registry']`
// after every successful write. A new write path MUST do the same; otherwise
// the picker silently serves a pre-write inventory for the rest of the session
// (final whole-branch review — this comment previously claimed no such write
// path existed, which was true only until Task 14 landed).

export type Registry = components['schemas']['RegistryDto']
export type RegistryTable = components['schemas']['RegistryTableDto']
/** One DISTINCT column set behind a DDL table name, with the mapping dirs that
 * carry it (Task 16). `RegistryTable.columns` is a UNION across every file
 * sharing the name — for the 11 corpus names whose files genuinely disagree it
 * matches no real file on disk, so only a VARIANT may ever be presented as
 * "what this table is". See `RegistryVariantDto`'s javadoc. */
export type RegistryVariant = components['schemas']['RegistryVariantDto']

export const useRegistry = () =>
  useQuery({
    queryKey: ['registry'],
    queryFn: () => apiGet<Registry>('/registry'),
    staleTime: Infinity,
  })
