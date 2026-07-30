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
The sidebar tree is already real (`src/api/filesystemAdapter.ts` + `useFilesystem`);
the four tab bodies (Viewer, Modifier, Operational, DAG) still render from
`mockData.ts` until their own sub-project rewires them — don't remove mock imports
you haven't actually replaced.

## API layer

`src/api/`:
- `types.gen.ts` — generated, committed; regenerate from a running backend with
  `make generate-api` (or `pnpm generate:api`) after any backend DTO change. Don't
  hand-edit it.
- `client.ts` — thin typed fetch wrapper (`apiGet`), problem+json → `ApiError`.
- `queries.ts` — TanStack Query hooks (`useTree`, `useMappingDom`, `useMappingModel`,
  `useRecipe`, `useDdl`, `useExpressions`, `useAppConfig`) and the type aliases app
  code should import instead of `types.gen.ts` directly.

## Key files

- `src/App.tsx` — main application component (tab shell)
- `src/main.tsx` — React entry point, `QueryClientProvider`
- `src/index.css` — design tokens (visual contract) + Tailwind import
- `src/mockData.ts` — legacy prototype data, retiring tab-by-tab
- `src/api/` — backend data layer (see above)
- `vite.config.ts` — dev server (port 8443), `/api` proxy, Tailwind plugin
