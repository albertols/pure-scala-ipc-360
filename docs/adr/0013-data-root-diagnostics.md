# ADR-0013: Data-root diagnostics and a configurable control-schema vocabulary

**Status:** Accepted

## Context

Every data root fails **silently and identically**. A `dwhControlRoot` without `LAYER_TO_LAYER/`
falls back to the committed mock mirror (ADR-0009, `DataRoots`); a layer directory outside
`LayerToLayerService`'s hardcoded eight is skipped without a warning; a `statements.sql` whose
`INSERT INTO` target is not the hardcoded `CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG` matches
nothing. All three end at the same place: `/api/relationships` serves an empty graph and Tab 3
renders `No relationship entries` — indistinguishable from a genuinely empty corpus, and
indistinguishable from each other.

Two of those three hardcoded values are **anonymized sample values, not IPC vocabulary**, the same
class of artifact as the `type` tokens ADR-0008's alias table handles. A real control-schema export
names its own control table and may use its own layer directory names, so a correctly-configured
corp export was likelier to miss than to hit — and got no signal either way.
`HOW_TO_RUN_ON_YOUR_DATA.md` §3.3 could only document the layer-name constraint as "that is a code
change", and did not document the table-name constraint at all.

## Decision

**Lift the vocabulary into configuration.** `Etl360Properties.LayerToLayer` carries `anchorTable`
and `layerDirs` (`etl360.layer-to-layer.*`, `ETL360_L2L_TABLE` / `ETL360_L2L_LAYER_DIRS`,
`config.json` `layerToLayerTable` / `layerDirs`). Defaults are exactly today's values, so the
committed corpus, the CAS generators and every existing test are byte-unaffected.

**Add `GET /api/diagnostics`.** `DiagnosticsService` re-walks the control schema the way
`LayerToLayerService` does — sharing its vocabulary and tier resolution, never a second copy — but
records what it saw at each step rather than only the rows that survived. The counts are staged on
purpose (`presentDirs` → `filesRead` → `anchorHits` → `rowsParsed`): the first one that reads zero
*is* the failing step, and each has a different fix. It also reports `insertTargetsFound[]`, the
`INSERT INTO <table>` identifiers actually present, which turns "0 rows" into "your files say
`CTL.CORP_L2L_CONFIG` — put that in `layerToLayerTable`".

**Surface it in Tab 3.** An always-on toolbar chip (`⬤ data: real|mock|absent`) because a canvas of
`SYN`-marked mock rows looks exactly like a canvas of real ones; and the full report expanded under
`No relationship entries`, showing the path of the tier that actually **served** — never the
configured string echoed back, which teaches nothing.

## Consequences

- A wrong data root is diagnosable without leaving the GUI, and fixable without a code change.
- `/api/health` keeps its stable shape (`make validate-loop` curls it); the report is free to grow
  as new silent-failure modes are found.
- The diagnostics scan is a second read of the same files on each request. It is bounded by the
  layer-dir count (≤ tens of files) and only ever runs on demand.
- `DiagnosticsService` must keep sharing `LayerToLayerService`'s vocabulary and `DataRoots`' tier
  resolution. If it ever forked its own copy, the report could describe a scan that never happened.
- Diagnostics never throws: an unreadable file reports as empty rather than 500ing the one endpoint
  whose job is explaining failure.

## Alternatives considered

- **Auto-detect the control table** (accept any `INSERT INTO %_LAYER_TO_LAYER_CONFIG`) — magic that
  silently binds to the wrong table is the same class of bug as the one being fixed. Explicit
  configuration plus a report that names the value to type is strictly more legible.
- **Log it and point at the backend log** — the operator is looking at a GUI; the log is the place
  this failure already went unnoticed.
- **Extend `/api/health`** — health is a liveness probe with a stable contract; growing detail on it
  couples the gate scripts to a shape that should stay free to change.
