---
name: validate-loop
description: Use when asked to run the end-to-end validation gate over the mock operational data — always via make validate-loop, what it checks, and how to read a failure.
---

# validate-loop

Thin wrapper over `make validate-loop` (`scripts/validate_loop.sh`). Boots the backend
(install-then-run pattern), curls `/api/health`, `/api/relationships`,
`/api/operational/dates`, `/api/operational/2026-07-29` (+ a known-missing date 404),
then runs `cd frontend && pnpm test`. Tears the backend down on exit either way (trap).

```bash
make validate-loop
```

## Reading a failure

- `dwhControlMode`/`composerMode` absent — `real`/`mock` both pass, only `absent` fails.
- `relationships`/`dates`/`snapshot` grep failures — check the mock mirror under
  `backend/src/main/resources/mock/` (LAYER_TO_LAYER `statements.sql`, composer b15 CSVs).
- `backend never came up` — same fix as `run-app`: boot by hand
  (`mvn -q -am -pl backend install -DskipTests` then `cd backend && mvn spring-boot:run`)
  and read the log directly.
- Frontend test failure at the end — same as `make test-frontend`.
