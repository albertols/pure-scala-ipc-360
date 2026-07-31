# ADR-0009: config.json entrypoint with env-var layering

**Status:** Accepted

## Context

Running the suite on own data required hand-exporting four ETL360_* vars plus
JAVA_HOME/node paths; scripts/dev.sh accrued uncommitted local toolchain hacks. The
backend already resolves every root via `${ETL360_*:default}` placeholders
(application.yml) with real→mock→absent fallback (DataRoots), so a thin optional
front door can feed it without new Spring code.

## Decision

A git-ignored root `config.json` (committed `config.example.json` template) is the
single user entrypoint: xmltobqPath, composerRoot, dwhControlRoot, gcpProjectId,
javaHome, nodeBin. `scripts/dev.sh` maps it onto the existing env vars. Layering for
ETL360_* keys: application.yml defaults < config.json < .env < shell env; for
javaHome/nodeBin, config.json outranks ambient env (machine-global toolchain vars
are noise; repo-specific ETL360_* vars are deliberate). Empty string = auto-detect.
config.json is optional — a fresh clone boots on committed defaults.

## Consequences

- `git pull && cp config.example.json config.json && make dev` runs on own data.
- Backend stays mechanism-agnostic; env vars remain the only backend contract.
- The dev.sh mapping table must track application.yml by hand (acceptance-walked).

## Alternatives considered

- **`spring.config.import` of config.json** — couples the backend to a suite-level
  concern; dev.sh would still need its own reader for toolchains.
- **`.env` as sole entrypoint** — users must learn ETL360_* names instead of four
  domain keys; no place for javaHome/nodeBin semantics.
