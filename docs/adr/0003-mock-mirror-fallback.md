# ADR-0003: Committed mock mirror with real/mock/absent fallback

**Status:** Accepted

## Context

Operational data (`DWH_CONTROL/` control-schema export, Composer scheduling export) comes from real systems and must stay git-ignored, but the frontend and its tests need something to render when no real export is present — including in CI, which never has real data.

## Decision

A `DataRoots` component resolves each data root with a fallback: `DWH_CONTROL` prefers the real, git-ignored directory (`ETL360_DWH_CONTROL_ROOT`) and falls back to a **committed** mock mirror at `backend/src/main/resources/mock/DWH_CONTROL/` when the real one is absent. Mode (`"real" | "mock" | "absent"`) is exposed via `/api/config` and `/api/health`.

## Consequences

- The suite is runnable and testable with zero real operational data present.
- Composer has **no mock tier** in Foundation — its mode is `"real" | "absent"` only; Composer CSVs aren't populated as mock content until a later sub-project needs them.
- Mock content population (beyond the `README.md` placeholder committed in Foundation) is deferred to sub-project 4 (Synthetic operational data); Foundation ships the mechanism and directory, not the data.

## Alternatives considered

- **Generate synthetic data into the git-ignored real dir** — nothing would be versioned, so every fresh clone/CI run starts with no fallback at all.
- **Backend-only in-memory mocks (no files)** — no reusable fixture on disk for tests or manual inspection.
