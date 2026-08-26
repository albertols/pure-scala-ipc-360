#!/usr/bin/env bash
# ETL 360 dev boot: resolve config (config.json / .env / environment / auto-detect),
# build backend, boot backend + frontend. `--check-config` prints the resolution
# table and exits. Layering: ADR-0009. HOW-TO: HOW_TO_RUN_ON_YOUR_DATA.md.
set -euo pipefail
cd "$(dirname "$0")/.."

# ANSI only on a TTY with NO_COLOR unset (https://no-color.org)
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BLD=$'\033[1m'; DIM=$'\033[2m'; GRN=$'\033[32m'; CYN=$'\033[36m'; RST=$'\033[0m'
else BLD=''; DIM=''; GRN=''; CYN=''; RST=''; fi
step() { echo "${BLD}${CYN}[$1]${RST} $2"; }

step 1/4 "config resolution"
# .env tier: sourced with allexport so its values count as environment below.
# Precedence per ADR-0009 (docs/adr/0009-config-json-entrypoint.md): application.yml
# defaults < config.json < .env < shell env — an already-exported shell var must WIN.
# A plain `. ./.env` would instead overwrite it (last assignment wins), inverting
# that order, so snapshot pre-existing values for any key .env also defines and
# restore them after sourcing; keys only present in .env still apply normally.
if [ -f .env ]; then
  _dotenv_saved=()
  while IFS='=' read -r _k _rest; do
    case "$_k" in ''|'#'*) continue ;; esac
    if [ -n "${!_k+x}" ]; then _dotenv_saved+=("$_k=${!_k}"); fi
  done < .env
  set -a; . ./.env; set +a
  for _kv in "${_dotenv_saved[@]+"${_dotenv_saved[@]}"}"; do export "$_kv"; done
  unset _dotenv_saved _k _rest _kv
fi
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
# A JDK is usable only if it exists AND probes >= 17 — the backend and the Spring Boot
# maven plugin both refuse anything older. Probing (not trusting) is the whole point:
# `java_home -v 17` and a machine-global JAVA_HOME both lie on this repo's dev machines.
ok17() { [ -n "${1:-}" ] && [ -x "$1/bin/java" ] && [ "$(jmajor "$1")" -ge 17 ] 2>/dev/null; }
JBR="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"
JAVA_FATAL=""
ENV_JAVA_NOTE=""
v="$(cfg javaHome)"
if [ -n "$v" ]; then
  # config.json is an explicit instruction: honour it, but never silently accept a
  # too-old JDK — a wrong value here must fail loudly, not 40 lines into a Maven trace.
  export JAVA_HOME="$v"; SRC_JAVA="config.json"
  ok17 "$JAVA_HOME" || JAVA_FATAL="config.json javaHome points at $( [ -x "$v/bin/java" ] && echo "JDK $(jmajor "$v")" || echo 'no JDK' ): $v"
elif ok17 "${JAVA_HOME:-}"; then
  SRC_JAVA="env"
else
  # An exported-but-too-old JAVA_HOME is the single most common local-machine failure
  # (e.g. a shell profile pinning JDK 11). Ignore it and keep auto-detecting rather
  # than warning and marching into a guaranteed build failure.
  if [ -n "${JAVA_HOME:-}" ]; then
    ENV_JAVA_NOTE=" — ignored env JDK $(jmajor "${JAVA_HOME}" 2>/dev/null || echo '?'), needs 17+"
  fi
  if v="$(/usr/libexec/java_home -v 17 2>/dev/null)" && ok17 "$v"; then
    export JAVA_HOME="$v"; SRC_JAVA="auto (java_home)${ENV_JAVA_NOTE}"
  elif ok17 "$JBR"; then
    export JAVA_HOME="$JBR"; SRC_JAVA="auto (IntelliJ JBR)${ENV_JAVA_NOTE}"
  else
    SRC_JAVA="NONE FOUND${ENV_JAVA_NOTE}"
    JAVA_FATAL="no JDK 17+ found (checked config.json javaHome, \$JAVA_HOME, /usr/libexec/java_home -v 17, IntelliJ JBR)"
  fi
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
# MUST mirror DataRoots.java: a root is "real" only if it carries the substructure its
# reader needs ($3), not merely because the directory exists. A legacy DWH_CONTROL with
# no LAYER_TO_LAYER/ reports mock here exactly as the backend resolves it — otherwise
# this table would confidently print "real" for a root the server has fallen back from.
mode() {
  if [ -d "$1/$3" ]; then echo real
  elif [ -d "backend/src/main/resources/mock/$2/$3" ]; then echo mock
  else echo absent; fi
}
row() { printf '  %-12s %s %s(%s)%s\n' "$1" "$2" "$DIM" "$3" "$RST"; }
row xmltobq     "$CORPUS"   "$SRC_CORPUS"
row DWH_CONTROL "$DWH"      "$SRC_DWH, mode $(mode "$DWH" DWH_CONTROL LAYER_TO_LAYER)"
row composer    "$COMPOSER" "$SRC_COMPOSER, mode $(mode "$COMPOSER" composer dwh/config/cluster_tuning/inputs)"
row gcp-project "$GCP"      "$SRC_GCP"
row JAVA_HOME   "${JAVA_HOME:-—}" "$SRC_JAVA"
row node        "$(command -v node || echo '—')" "$SRC_NODE"

if [ "${1:-}" = "--check-config" ]; then
  # Diagnostic mode still exits 0 (its contract) — the JAVA_HOME row above already
  # shows NONE FOUND / the ignored env JDK, which is the answer the user came for.
  [ -n "$JAVA_FATAL" ] && echo "  ${DIM}note: $JAVA_FATAL${RST}"
  exit 0
fi
if [ -n "$JAVA_FATAL" ]; then
  echo "error: $JAVA_FATAL"
  echo "       The backend (Java 17) and spring-boot-maven-plugin 3.3.4 both require JDK 17+."
  echo "       Fix: set \"javaHome\" in config.json to a JDK 17+ home, e.g."
  echo "         \"javaHome\": \"/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home\""
  echo "       (find candidates with: /usr/libexec/java_home -V)"
  exit 1
fi
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
