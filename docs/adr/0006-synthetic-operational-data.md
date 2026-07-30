# ADR-0006: Synthetic operational data — mock tiers, determinism, SYN naming

**Status:** Accepted

## Context

Sub-project 4 needed a committed table-relationships graph and a b15 job-history feed renderable with zero real DWH_CONTROL/Composer exports present — the same no-real-data-in-CI requirement ADR-0003 solved for DWH_CONTROL, now extended to Composer and to `LayerToLayerConfig`-derived relationships.

## Decision

Extend the mock mirror: `mock/DWH_CONTROL/LAYER_TO_LAYER/<LAYER>/statements.sql`, read by a **purpose-built INSERT tokenizer** (not a SQL parser — it understands only the one fixed `SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES` shape), plus `mock/composer/.../inputs/<YYYY_MM_DD>/b15_*.csv`, produced by `scripts/gen_b15_history.py` (`random.Random(seed)`, sorted iteration, no wall-clock reads — same inputs ⇒ byte-identical CSVs, fixed anchor window). Every synthetic mapping/table name carries a `SYN` marker.

## Consequences

- `DataRoots.composer()` gains a mock tier (`"real"` \| `"mock"` \| `"absent"`), updating ADR-0003's "no mock tier for composer in Foundation" — that statement was explicitly Foundation-scoped, not a lasting constraint.
- `make validate-loop` exercises the whole mirror end-to-end; no sub-project needs real DWH_CONTROL/Composer data to develop or run CI.
- Regenerating history means re-running the generator, never hand-editing CSVs — the script, not the file, is the artifact of record.

## Alternatives considered

- **A general SQL parser (Calcite) for statements.sql** — overkill for one fixed INSERT shape; rejected, same reasoning that keeps the real parser out of this path.
- **Wall-clock "today" as the anchor** — breaks determinism/CI reproducibility; rejected for a fixed `2026_07_16`–`2026_07_29` window.
