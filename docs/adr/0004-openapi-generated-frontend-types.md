# ADR-0004: Frontend TS types generated from the backend OpenAPI spec

**Status:** Accepted

## Context

The backend and frontend are separate build systems (Maven/Java, Vite/TypeScript) serving/consuming the same 8 JSON endpoints. Hand-written TS interfaces for backend DTOs drift silently the moment a Java record field is renamed, added, or removed.

## Decision

springdoc-openapi serves the backend's live OpenAPI document (`/v3/api-docs`); `openapi-typescript` generates `frontend/src/api/types.gen.ts` from it (`pnpm generate:api` / `make generate-api`). The generated file is **committed** so the frontend builds without a running backend; `queries.ts` re-exports named type aliases (`TreeNode`, `XmlNode`, ...) so app code never imports `types.gen.ts` directly.

## Consequences

- A backend DTO change not reflected by regenerating types is an uncommitted diff in `types.gen.ts` — `make check` catches drift instead of it surfacing as a runtime mismatch.
- Generating requires a running backend; this is a manual step (`make generate-api`), not part of every `make check`/`make build` run.
- The frontend has zero backend-schema knowledge beyond this one generated file plus the thin re-export layer in `queries.ts`.

## Alternatives considered

- **Hand-written TS interfaces mirroring the DTOs** — no generation step, but silent drift on every backend-side rename; unsustainable across 8 endpoints.
- **Runtime schema validation (e.g. zod)** — catches drift at request time, not build time; adds a second schema source to keep in sync.
