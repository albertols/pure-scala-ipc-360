#!/usr/bin/env bash
# ETL 360 dev boot: resolve config (config.json / .env / environment / auto-detect),
# build backend, boot backend + frontend. `--check-config` prints the resolution
# table and exits. Layering: ADR-0009. HOW-TO: README "Run the 360 suite on your own data".
set -euo pipefail
cd "$(dirname "$0")/.."

# ANSI only on a TTY with NO_COLOR unset (https://no-color.org)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BLD=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; CYN=$'\033[36m'; RST=$'\033[0m'
else BLD=''; DIM=''; GRN=''; CYN=''; RST=''; fi
step() { echo "${BLD}${CYN}[$1]${RST} $2"; }

step 1/4 "config resolution"
# .env tier: sourced with allexport so its values count as environment below.
if [ -f .env ]; then set -a; . ./.env; set +a; fi
# config.json: validated once, read via python3 (stdlib) — jq is NOT assumed.
if [ -f config.json ] && ! python3 -m json.tool config.json >/dev/null 2>&1; then
  echo "config.json is not valid JSON — fix it or remove it"; exit 1
fi
cfg() {  # cfg <key> -> string value or empty
  [ -f config.json ] || return 0
  python3 -c 'import json,sys
v = json.load(open("config.json")).get(sys.argv[1], "")
print(v if isinstance(v, str) else "", end="")' "$1"
}
# NOTE: resolve() must be called directly (never via $(...)) — a command-substitution
# subshell would swallow the exports.
resolve() {  # resolve <ENV_VAR> <jsonKey>; env > config.json > default; sets RES_SRC
  local var="$1" v
  if [ -n "${!var:-}" ]; then RES_SRC="env"; return; fi
  v="$(cfg "$2")"
  if [ -n "$v" ]; then export "$var=$v"; RES_SRC="config.json"; return; fi
  RES_SRC="default"
}
resolve ETL360_CORPUS_ROOT xmltobqPath;         SRC_CORPUS=$RES_SRC
resolve ETL360_COMPOSER_ROOT composerRoot;      SRC_COMPOSER=$RES_SRC
resolve ETL360_DWH_CONTROL_ROOT dwhControlRoot; SRC_DWH=$RES_SRC
resolve ETL360_GCP_PROJECT gcpProjectId;        SRC_GCP=$RES_SRC

# Toolchains: config.json OUTRANKS ambient env (machine-global JAVA_HOME/PATH are the
# usual noise — on this repo's dev machine `java_home -v 17` returns an Azul 11).
jmajor() { "$1/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1; }
JBR="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"
v="$(cfg javaHome)"
if [ -n "$v" ]; then export JAVA_HOME="$v"; SRC_JAVA="config.json"
elif [ -n "${JAVA_HOME:-}" ]; then SRC_JAVA="env"
elif v="$(/usr/libexec/java_home -v 17 2>/dev/null)" && [ "$(jmajor "$v")" -ge 17 ] 2>/dev/null; then
  export JAVA_HOME="$v"; SRC_JAVA="auto (java_home)"
elif [ -d "$JBR" ] && [ "$(jmajor "$JBR")" -ge 17 ] 2>/dev/null; then
  export JAVA_HOME="$JBR"; SRC_JAVA="auto (IntelliJ JBR)"
else SRC_JAVA="unset — PATH java"; fi
if [ -n "${JAVA_HOME:-}" ] && [ "$(jmajor "$JAVA_HOME")" -lt 17 ] 2>/dev/null; then
  echo "warning: JAVA_HOME is JDK $(jmajor "$JAVA_HOME") — backend needs 17+ (set javaHome in config.json)"
fi
v="$(cfg nodeBin)"
if [ -n "$v" ]; then export PATH="$v:$PATH"; SRC_NODE="config.json"
elif v="$(ls -d "$HOME"/.local/toolchains/node-v*/bin 2>/dev/null | sort -V | tail -1)" && [ -n "$v" ]; then
  export PATH="$v:$PATH"; SRC_NODE="auto (toolchain)"
elif command -v node >/dev/null; then SRC_NODE="PATH"
else SRC_NODE="missing"; fi

# Effective values (defaults mirror backend/src/main/resources/application.yml) + modes
CORPUS="${ETL360_CORPUS_ROOT:-parser/src/main/resources/xmltobq}"
DWH="${ETL360_DWH_CONTROL_ROOT:-parser/src/main/resources/DWH_CONTROL}"
COMPOSER="${ETL360_COMPOSER_ROOT:-parser/src/main/resources/composer}"
GCP="${ETL360_GCP_PROJECT:-db-dev-example-project}"
mode() { if [ -d "$1" ]; then echo real; elif [ -d "backend/src/main/resources/mock/$2" ]; then echo mock; else echo absent; fi; }
row() { printf '  %-12s %s %s(%s)%s\n' "$1" "$2" "$DIM" "$3" "$RST"; }
row xmltobq     "$CORPUS"   "$SRC_CORPUS"
row DWH_CONTROL "$DWH"      "$SRC_DWH, mode $(mode "$DWH" DWH_CONTROL)"
row composer    "$COMPOSER" "$SRC_COMPOSER, mode $(mode "$COMPOSER" composer)"
row gcp-project "$GCP"      "$SRC_GCP"
row JAVA_HOME   "${JAVA_HOME:-—}" "$SRC_JAVA"
row node        "$(command -v node || echo '—')" "$SRC_NODE"

if [ "${1:-}" = "--check-config" ]; then exit 0; fi
command -v mvn  >/dev/null || { echo "mvn not found — install Maven 3.9+"; exit 1; }
command -v node >/dev/null || { echo "node not found — set nodeBin in config.json or install Node 22"; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm not found — corepack enable, or install pnpm 9+"; exit 1; }
trap 'kill 0 2>/dev/null' INT TERM EXIT

step 2/4 "backend build"
# `mvn -am -pl backend spring-boot:run` fans the run goal across the reactor
# (including parser) and fails — install parser+backend, then run scoped to backend.
mvn -q -am -pl backend install -DskipTests

step 3/4 "backend boot"
( cd backend && mvn -q spring-boot:run 2>&1 | sed -u 's/^/[backend]  /' ) &
printf '  waiting for http://127.0.0.1:8080/api/health '
for i in $(seq 1 90); do
  if curl -sf localhost:8080/api/health >/dev/null; then echo " ${GRN}up${RST}"; break; fi
  printf '.'; sleep 1
  if [ "$i" = 90 ]; then echo " backend never came up (see [backend] log)"; exit 1; fi
done

step 4/4 "frontend"
( cd frontend && pnpm dev 2>&1 | sed -u 's/^/[frontend] /' ) &
echo "${BLD}ETL 360 up${RST} — backend ${GRN}http://127.0.0.1:8080${RST} · frontend ${GRN}http://localhost:8443${RST} (proxies /api/*) · Ctrl-C stops both"
wait
