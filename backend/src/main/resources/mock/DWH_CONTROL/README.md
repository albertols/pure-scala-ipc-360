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
    ├── STG/statements.sql
    ├── ODS/statements.sql
    ├── DWH/statements.sql
    ├── CDM/statements.sql
    ├── RDM/statements.sql
    ├── QDM/statements.sql
    ├── ETL/statements.sql
    ├── OUTPUT/statements.sql
    └── ARCHIVE/statements.sql
```

- Each `<LAYER>` directory (`STG`, `ODS`, `DWH`, `CDM`, `RDM`, `QDM`, `ETL`, `OUTPUT`)
  matches a top-level directory under the `xmltobq/` corpus.
- `statements.sql` holds the layer's `LayerToLayerConfig` control statements: one
  `INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES (...)` per line, the
  SQL DBM Composer/Control-M would issue to move data between that layer's source and
  target tables. `LayerToLayerService` reads exactly these eight layer directories.
- `ARCHIVE/statements.sql` is a decoy: it lives outside the eight layers the service
  reads, and its one row references a recipe (`_ETL_m_SYN_DECOY_NEVER_SERVED.json`)
  that deliberately does not exist in the corpus — proving that anything outside the
  known layer set is ignored.

## Status

Each of the eight layer directories carries a mix of synthetic (`SYN`-marked, one per
`m_SYN_*` corpus mapping) and real anonymized rows. Every non-decoy row's `recipe`
value resolves to an `_ETL_<mapping>.json` file under `parser/src/main/resources/xmltobq`.
