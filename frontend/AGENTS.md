# frontend — ETL 360 GUI

React 19 + Vite 8 + Tailwind CSS v4. Originally a Figma Make prototype; now part of
the ETL 360 monorepo (`pure-scala-ipc-360`), being wired tab-by-tab to the real
`backend/` REST API. See root `CLAUDE.md` and `docs/architecture.md` for the whole
suite; this file covers `frontend/` specifics only.

**This is not a Figma Make sandbox.** There is no dev server "always running" and no
`.mise.toml` — those were prototype-platform assumptions that no longer apply. Run
everything locally as described below.

## Development

```bash
make dev            # from repo root: backend :8080 + frontend :8443 together
# or, with the backend already running separately:
pnpm dev             # frontend only, http://localhost:8443
```

`vite.config.ts` proxies `/api/*` to `http://localhost:8080` — without a running
backend, API calls 502 (the sidebar tree shows its error state; this is expected, not
a bug).

## Testing

```bash
pnpm test            # vitest run — unit/component tests (RTL, MSW-mocked API)
pnpm test:watch       # watch mode
npx tsc --noEmit      # type-check (part of `make check`)
```

## Visual contract — read before touching any component

The prototype's look (dark theme tokens in `src/index.css`, Inter/JetBrains Mono,
component layout and interactions) is a **hard contract** — see
`docs/adr/0005-figma-visual-contract.md`. Rewiring a tab to real data means swapping
its data source only. No restyling, spacing, or interaction changes without an
explicit ask. New UI states (loading, error, empty) reuse existing tokens
(`--text-dim`, `--red`, etc.) rather than introducing new ones.

`src/mockData.ts` is **legacy, being retired tab-by-tab** (see its header comment).
The sidebar tree, Tab 1 (IPC ETL Viewer), Tab 2 (ETL Modifier), and Tab 4 (ETL DAG) are
already real (`src/api/filesystemAdapter.ts` + `useFilesystem`; `src/api/mappingAdapter.ts`
+ `useMappingModel`/`useMappingDom`; `src/api/recipeAdapter.ts` + `useRecipe`/`useDdl`;
`src/api/dagAdapter.ts` + `useRelationships`/`useOperationalSnapshots`). The `MAPPINGS`
export Tab 1 consumed, the `ETL_RECIPES`/`DDL_SCHEMAS` exports Tab 2 consumed, and the
`DAG_CLUSTERS`/`DAG_RUNS` exports Tab 4 consumed are all gone (zero importers, verified by
grep at each retirement). Only Tab 3 (Operational) still renders from `mockData.ts` until
its own sub-project rewires it — don't remove mock imports you haven't actually replaced.
Tab 4's Replay button is a client-side mock toast (no Pub/Sub) — labeled in `ETLDag.tsx`.

## API layer

`src/api/`:
- `types.gen.ts` — generated, committed; regenerate from a running backend with
  `make generate-api` (or `pnpm generate:api`) after any backend DTO change. Don't
  hand-edit it.
- `client.ts` — thin typed fetch wrapper: `apiGet` for reads, `apiSend` for
  `PUT`/`POST` writes (recipe save/validate/rollback); both map problem+json →
  `ApiError`.
- `queries.ts` — TanStack Query hooks (`useTree`, `useMappingDom`, `useMappingModel`,
  `useRecipe`, `useDdl`, `useExpressions`, `useAppConfig`, plus the Operational/DAG
  hooks) and the type aliases app code should import instead of `types.gen.ts`
  directly. Hooks keyed on a path argument (`useMappingDom`, `useMappingModel`,
  `useRecipe`, `useDdl`) set `enabled: !!path` so no request fires before a tree click
  supplies one.
- `recipeAdapter.ts` (recipe→canvas projection, `recipeToCanvas`) and
  `recipeEdits.ts` (immutable draft mutators — `setFieldTransformation`, `addStep`,
  `deleteNode`, `deleteEdge`, …) behind Tab 2's editing state: `import type` only,
  runtime imports use explicit `.ts` extensions so `node --experimental-strip-types`
  can load the chain for `scripts/recipe_sweep.mts`.

## Key files

- `src/App.tsx` — main application component (tab shell)
- `src/main.tsx` — React entry point, `QueryClientProvider`
- `src/index.css` — design tokens (visual contract) + Tailwind import
- `src/mockData.ts` — legacy prototype data, retiring tab-by-tab
- `src/api/` — backend data layer (see above)
- `vite.config.ts` — dev server (port 8443), `/api` proxy, Tailwind plugin
