---
name: run-app
description: Use when asked to run, start, verify, or health-check the ETL 360 suite locally (backend + frontend) — boots both, checks liveness, and points at logs.
---

# run-app

Thin wrapper over `make dev` (`scripts/dev.sh`) — don't invent a different boot sequence.

```bash
make dev
```
Backend `http://127.0.0.1:8080` (in-JVM parser calls); frontend `http://localhost:8443` (Vite proxies `/api/*` to the backend — a down backend means 502s and the sidebar's error state, expected not a bug). Logs stream prefixed `[backend]`/`[frontend]`; Ctrl-C stops both.

## Verify it's up

```bash
curl -s localhost:8080/api/health | python3 -m json.tool
```
Expect `"status":"UP"`, non-zero `xmlCount`/`recipeCount`, `dwhControlMode`/`composerMode` present (`real`|`mock`|`absent`).

## If something's wrong

Backend won't boot: run `mvn -q -am -pl backend install -DskipTests` by hand first (`spring-boot:run` across the full `-am` reactor doesn't work). Frontend 502s on `/api/*`: backend isn't up — check the `[backend]` log. Full reference: `docs/architecture.md`.
