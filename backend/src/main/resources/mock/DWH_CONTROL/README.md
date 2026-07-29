# Mock `DWH_CONTROL` mirror

This directory is a **committed, synthetic stand-in** for the real `DWH_CONTROL`
control-schema export. The real `DWH_CONTROL/` (normally at
`parser/src/main/resources/DWH_CONTROL/`) is anonymized-sensitive operational data,
so it is git-ignored and only present on machines that have been given a copy.

`DataRoots` (`backend/src/main/java/io/pure360/etl360/config/DataRoots.java`) resolves
`dwhControl()` / `dwhControlMode()` with a three-tier fallback, computed fresh on every
call:

1. **`real`** — `etl360.dwh-control-root` exists on disk (the real, git-ignored export).
2. **`mock`** — falls back to `<etl360.mock-root>/DWH_CONTROL` (this directory), if it
   exists.
3. **`absent`** — neither exists.

This lets the backend and frontend run against something meaningful even when nobody
has copied the real, sensitive `DWH_CONTROL/` export onto the machine.

## Layout

The mirror follows the same shape as the real export:

```
DWH_CONTROL/
└── LAYER_TO_LAYER/
    └── <LAYER>/
        └── statements.sql
```

- `<LAYER>` is one of the corpus layer names (e.g. `CDM`, `DWH`, `ETL`, `ODS`, …) —
  matching the top-level directories under the `xmltobq/` corpus.
- `statements.sql` holds the layer's `LayerToLayerConfig` control statements: the SQL
  DBM Composer/Control-M would issue to move data between that layer's source and
  target tables.

## Status

No `statements.sql` files are populated yet. Generating realistic synthetic
`LAYER_TO_LAYER/<LAYER>/statements.sql` content is scoped to **sub-project 4 —
"Synthetic operational data"** of the ETL 360 roadmap (see
`docs/superpowers/specs/2026-07-29-etl360-foundation-design.md`). This Foundation task
only establishes the directory, the fallback mechanism, and the mode reporting
(`dwhControlMode` in `GET /api/config` and `GET /api/health`) — not the mock data
itself.
