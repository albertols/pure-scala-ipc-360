# ADR-0001: Multi-module Maven with an in-JVM Spring Boot backend

**Status:** Accepted

## Context

ETL 360 needs a read-only REST API in front of the existing Scala parser so the frontend can show real corpus data instead of `mockData.ts`. The parser is pure Scala 2.12 / JDK 11 target; reimplementing Powermart XML semantics in a second language was rejected outright — that logic already exists and is trusted.

## Decision

Restructure as a Maven multi-module reactor: `parser/` (existing Scala, moved verbatim, behavior unchanged) plus a new `backend/` module (Spring Boot 3.3, Java 17) that depends on `parser` and calls it **in-JVM** (`XMLRoot.parsePowermart` directly, no subprocess/HTTP hop).

## Consequences

- One JVM, one process; no serialization boundary — DTOs are plain mappers over Scala case classes (ADR-0002).
- Backend/parser run different Java targets (17 vs. 11) via per-module `maven.compiler.release`.
- `spring-boot:run` doesn't compose with `-am` across the reactor, hence the install-then-run pattern in `make dev`/`scripts/dev.sh`.

## Alternatives considered

- **Spring Boot 2.7 on Java 11** — matches the parser's JDK target, but an EOL framework line.
- **Node.js sidecar over CLI/subprocess** — avoids JVM concerns, but duplicates Powermart semantics and diverges from the Spring Boot requirement.
