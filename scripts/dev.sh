#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0 2>/dev/null' INT TERM EXIT
# Build first: `mvn -am -pl backend spring-boot:run` fans the run goal out across the
# whole reactor (including parser) and fails — the multi-module reactor and
# spring-boot:run don't mix. Install parser+backend to the local repo, then run
# spring-boot:run scoped to backend only.
mvn -q -am -pl backend install -DskipTests
( cd backend && mvn -q spring-boot:run 2>&1 | sed -u 's/^/[backend]  /' ) &
( cd frontend && pnpm dev 2>&1 | sed -u 's/^/[frontend] /' ) &
wait
