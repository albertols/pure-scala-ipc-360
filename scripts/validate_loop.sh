#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# The gate validates the COMMITTED mock data, so pin the mock tiers unless the caller
# overrode them. Without this, an untracked local `parser/src/main/resources/DWH_CONTROL`
# (or composer) wins the real tier in DataRoots and the relationships/operational gates
# silently assert against an empty graph — a gate that flips on machine state is not a gate.
export ETL360_DWH_CONTROL_ROOT="${ETL360_DWH_CONTROL_ROOT:-backend/src/main/resources/mock/DWH_CONTROL}"
export ETL360_COMPOSER_ROOT="${ETL360_COMPOSER_ROOT:-backend/src/main/resources/mock/composer}"
echo "[validate-loop] building backend…"
mvn -q -am -pl backend install -DskipTests
( cd backend && mvn -q spring-boot:run ) & BOOT=$!
# `kill $BOOT` only reaches the subshell — spring-boot:run forks the actual app into a
# grandchild JVM that survives it as an orphan, still bound to 8080. Belt-and-suspenders:
# also kill whatever's actually listening on 8080 so teardown is real, not just attempted.
# Every segment is `|| true`-guarded — under `set -e`, an unguarded failing command in a
# trap string truncates the rest of the trap (the reclaim step would silently never run,
# e.g. if $BOOT already died before the trap fires) and can flip the script's exit code
# even when every check passed. lsof may be absent on slim CI images; that segment
# self-guards the same way and is simply a no-op there.
trap 'kill $BOOT 2>/dev/null || true; wait $BOOT 2>/dev/null || true; lsof -ti tcp:8080 2>/dev/null | xargs kill -9 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf localhost:8080/api/health > /dev/null && break; sleep 1; [ "$i" = 60 ] && { echo "backend never came up"; exit 1; }; done
fail() { echo "[validate-loop] FAIL: $1"; exit 1; }
H=$(curl -sf localhost:8080/api/health) || fail "health"
# real tier wins over mock when the git-ignored real dirs exist locally — both prove the loop
echo "$H" | grep -Eq '"dwhControlMode":"(real|mock)"' || fail "dwhControlMode absent"
echo "$H" | grep -Eq '"composerMode":"(real|mock)"' || fail "composerMode absent"
curl -sf localhost:8080/api/relationships | grep -q '"nodes"' || fail "relationships"
# The relationships graph coming back EMPTY is a silent failure — /api/diagnostics is the only
# thing that says which of the four skip paths caused it, so gate on the report AND print it.
# On the committed mock tier every root resolves, so anything but ok is a real regression;
# a developer machine carrying a real DWH_CONTROL/composer resolves ok too.
DIAG=$(curl -sf localhost:8080/api/diagnostics) || fail "diagnostics"
echo "$DIAG" | python3 -c '
import json, sys
d = json.load(sys.stdin)
c = d["dwhControl"]; s = c["scan"]
print(f"[validate-loop] data roots: corpus={d["corpus"]["status"]} "
      f"dwhControl={c["status"]}(tier {c["tier"]}, rows {s["rowsParsed"]}) "
      f"composer={d["composer"]["status"]}(tier {d["composer"]["tier"]})")
for section in (d["corpus"], c, d["composer"]):
    if section["status"] != "ok":
        print(f"[validate-loop]   hint: {section["hint"]}")
sys.exit(0 if d["status"] == "ok" else 1)
' || fail "diagnostics reports a KO data root (see hint above)"
DATES=$(curl -sf localhost:8080/api/operational/dates) || fail "dates"
echo "$DATES" | grep -q '2026-07-29' || fail "anchor date missing"
curl -sf localhost:8080/api/operational/2026-07-29 | grep -q '"rows"' || fail "snapshot"
curl -s -o /dev/null -w '%{http_code}' localhost:8080/api/operational/2001-01-01 | grep -q 404 || fail "missing-date 404"

echo "[validate-loop] cluster index…"
CLUSTERS=$(curl -sf localhost:8080/api/operational/clusters) || fail "clusters"
echo "$CLUSTERS" | python3 -c '
import json, sys
d = json.load(sys.stdin)
t = d["totals"]
by_count = sorted((c["recipeCount"] for c in d["clusters"]), reverse=True)
print(f"[validate-loop] b15 index: {t["clusters"]} clusters, {t["recipes"]} recipes, "
      f"{t["dates"]} dates, {t["rows"]} rows; largest cluster {by_count[0]} recipes")
# Floors from the committed mock (spec section 8). A drop here means the CAS b15 block was
# regenerated from a changed manifest, or a data root flipped away from the committed mock.
assert t["clusters"] == 21, f"expected 21 clusters, got {t["clusters"]}"
assert t["recipes"] == 30, f"expected 30 recipes, got {t["recipes"]}"
assert t["dates"] == 14, f"expected 14 dates, got {t["dates"]}"
assert t["rows"] == 417, f"expected 417 rows, got {t["rows"]}"
# The whole point of the multi-recipe regrouping: without this the pane is untested.
assert by_count[0] >= 4, f"no cluster groups 4+ recipes (largest {by_count[0]})"
' || fail "cluster index floors"

echo "[validate-loop] readiness…"
READY=$(curl -sf localhost:8080/api/readiness) || fail "readiness"
echo "$READY" | python3 -c '
import json, sys
d = json.load(sys.stdin)
c, o, g = d["corpus"], d["operational"], d["dags"]
print(f"[validate-loop] readiness: {c["xml"]} xml, {c["recipes"]} recipes, {c["ddl"]} ddl; "
      f"{o["clusters"]} clusters, {o["days"]} days, {o["rows"]} rows; {g["workflows"]} workflows; "
      f"status {d["status"]}")
# Floors from the committed mock. A drop here means a data root flipped or the aggregate regressed.
assert c["xml"] == 81, f"expected 81 xml, got {c["xml"]}"
assert c["recipes"] == 86, f"expected 86 recipes, got {c["recipes"]}"
assert c["ddl"] == 212, f"expected 212 ddl, got {c["ddl"]}"
assert o["clusters"] == 21 and o["days"] == 14 and o["rows"] == 417, "operational floors moved"
# The DAG count is the one number only this endpoint serves — and it must NOT come from the graph.
# 22, not 23: a naive grep over LAYER_TO_LAYER/*/statements.sql sweeps in ARCHIVE/, a decoy
# directory outside the 8-name layer vocabulary that LayerToLayerService.entries() excludes
# (docs/adr/0016-landing-readiness-aggregate.md).
assert g["workflows"] == 22, f"expected 22 workflows, got {g["workflows"]}"
# "ok"/"ko" is the real vocabulary (DiagnosticsService, ADR-0013) — the backend never emits
# "degraded"; that word names only the frontend mascot mood (a presentational concept only).
assert d["status"] in ("ok", "ko"), "status must mirror diagnostics"
assert len(d["roots"]) == 3, "expected corpus, dwhControl and composer roots"
# progress is nullable and, per @JsonInclude(NON_NULL) on the DTO, ABSENT from the JSON
# entirely when null rather than serialized as "progress": null — so d.get(...), never d[...],
# is the only lookup that does not raise KeyError in the packaged-deployment case this comment
# describes. Only assert its shape when present, on this repo checkout of the committed mock
# where docs/ always exists.
progress = d.get("progress")
if progress is not None:
    assert progress["adrs"] >= 16, f"expected at least 16 ADRs, got {progress["adrs"]}"
' || fail "readiness floors"

FIRST_CLUSTER=$(echo "$CLUSTERS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clusters"][0]["name"])')
curl -sf "localhost:8080/api/operational/clusters/$FIRST_CLUSTER" | grep -q '"recipes"' || fail "cluster detail"
curl -s -o /dev/null -w '%{http_code}' localhost:8080/api/operational/clusters/no-such-cluster | grep -q 404 \
  || fail "unknown-cluster 404"

echo "[validate-loop] runs…"
RECIPE=$(curl -sf "localhost:8080/api/operational/clusters/$FIRST_CLUSTER" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["recipes"][0]["recipeFilename"])')
curl -sf "localhost:8080/api/operational/runs?recipe=$RECIPE&limit=10" | python3 -c '
import json, sys
runs = next(iter(json.load(sys.stdin)["byRecipe"].values()))
assert runs, "no runs for the first recipe of the first cluster"
assert runs[0]["date"] >= runs[-1]["date"], "runs are not newest-first"
# app_start_iso is what the Cloud Logging cursorTimestamp is derived from — no cursor without it.
assert runs[0]["appStartIso"], "run carries no appStartIso"
assert runs[0]["jobId"], "run carries no jobId"
' || fail "runs shape"

echo "[validate-loop] operational search…"
# ADR-0019. The TABLE assertion is the load-bearing one: table names live only in the L2L graph,
# so a search that returns recipes but no tables means the join silently degraded to the b15
# index — which is exactly the capability this endpoint exists to add.
curl -sf "localhost:8080/api/operational/search?q=CAS" | python3 -c '
import json, sys
d = json.load(sys.stdin)
hits = d["hits"]
kinds = {h["kind"] for h in hits}
assert hits, "search for CAS returned nothing"
assert "recipe" in kinds, "no recipe hits"
assert "table" in kinds, "no TABLE hits — the recipe->table->cluster join is not wired"
assert any(h["clusters"] for h in hits), "no hit names a cluster"
r = sum(1 for h in hits if h["kind"] == "recipe")
t = sum(1 for h in hits if h["kind"] == "table")
print(f"[validate-loop] search: {len(hits)} hits for CAS ({r} recipes, {t} tables)")
' || fail "operational search"
# Bounded by construction: a capped list must SAY it was capped.
curl -sf "localhost:8080/api/operational/search?q=CAS&limit=2" | python3 -c '
import json, sys
d = json.load(sys.stdin)
n = len(d["hits"])
assert n == 2, f"limit not honoured: {n}"
assert d["truncated"] is True, "capped result did not report truncated"
' || fail "search bounds"
# A one-character query is a search box on its first keystroke, not a caller bug.
curl -s -o /dev/null -w '%{http_code}' "localhost:8080/api/operational/search?q=c" | grep -q 200   || fail "short query should be 200-with-empty, not an error"
curl -s -o /dev/null -w '%{http_code}' "localhost:8080/api/operational/search?q=CAS&limit=500" | grep -q 400   || fail "over-range limit should be 400"

echo "[validate-loop] lineage…"
# ADR-0020. The both-directions assertion is load-bearing: a lineage that only walks one way
# still renders as a flow, so a regression there would be invisible in the GUI.
SEED=$(curl -sf "localhost:8080/api/operational/search?q=CAS_DWH_EVENTS_FACT" \
  | python3 -c 'import json,sys; hits=json.load(sys.stdin)["hits"]; print(next(h["name"] for h in hits if h["kind"]=="table"))')
curl -sf "localhost:8080/api/operational/lineage?node=table:$SEED" | python3 -c '
import json, sys
d = json.load(sys.stdin)
nodes, edges = d["nodes"], d["edges"]
hops = {n["hop"] for n in nodes}
ids = {n["id"] for n in nodes}
assert 0 in hops, "seed is not at hop 0"
assert any(h < 0 for h in hops), "no upstream reached"
assert any(h > 0 for h in hops), "no downstream reached"
for e in edges:
    assert e["from"] in ids and e["to"] in ids, "edge endpoint outside the returned nodes"
assert not d["truncated"], "committed mock lineage should fit the default budget"
assert d["totalReachable"] == len(nodes), "totalReachable disagrees with an untruncated result"
up = sum(1 for n in nodes if n["hop"] < 0)
down = sum(1 for n in nodes if n["hop"] > 0)
print(f"[validate-loop] lineage: {len(nodes)} nodes ({up} up, {down} down), {len(edges)} edges")
' || fail "lineage"
# Bounded like /search: a capped flow must SAY it was capped.
curl -sf "localhost:8080/api/operational/lineage?node=table:$SEED&limit=2" | python3 -c '
import json, sys
d = json.load(sys.stdin)
n = len(d["nodes"])
assert n == 2, f"limit not honoured: {n}"
assert d["truncated"] is True, "capped lineage did not report truncated"
assert d["totalReachable"] > 2, "totalReachable did not survive truncation"
' || fail "lineage bounds"
curl -s -o /dev/null -w '%{http_code}' "localhost:8080/api/operational/lineage?node=table:NOPE" | grep -q 404 \
  || fail "unknown lineage node should be 404"

echo "[validate-loop] b15 status vocabulary…"
# ADR-0018. The committed mock writes only canonical tokens, so an unrecognized one here means
# either the mock drifted or the normalizer regressed. FAILURE must be in the KO vocabulary —
# it is the token whose absence made every failed run on a real export render as PENDING.
curl -sf localhost:8080/api/diagnostics | python3 -c '
import json, sys
b15 = json.load(sys.stdin)["b15"]
assert "FAILURE" in b15["statusKo"], "FAILURE is not in the KO vocabulary"
assert "SUCCESS" in b15["statusOk"], "SUCCESS is not in the OK vocabulary"
rows = b15["rowsScanned"]
assert rows == 417, f"b15 rows scanned moved: {rows}"
unrec = b15["unrecognizedStatuses"]
assert unrec == [], f"committed mock produced unrecognized status tokens: {unrec}"
nok, nko = len(b15["statusOk"]), len(b15["statusKo"])
print(f"[validate-loop] b15 vocabulary: {nok} ok / {nko} ko tokens, {rows} rows scanned, 0 unrecognized")
' || fail "b15 status vocabulary"

echo "[validate-loop] scoped relationships…"
FULL_NODES=$(curl -sf localhost:8080/api/relationships | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["nodes"]))')
curl -sf "localhost:8080/api/relationships?clusters=$FIRST_CLUSTER" | python3 -c "
import json, sys
g = json.load(sys.stdin)
nodes = g['nodes']
assert 0 < len(nodes) < $FULL_NODES, f'scoped graph is not a strict subset: {len(nodes)} vs $FULL_NODES'
assert g['meta']['neighborCount'] == sum(1 for n in nodes if n.get('neighbor')), 'neighborCount mismatch'
print(f\"[validate-loop] scoped graph: {len(nodes)} nodes ({g['meta']['neighborCount']} neighbours) of $FULL_NODES\")
" || fail "scoped relationships"
# The unscoped response must stay byte-identical for every existing caller.
curl -sf localhost:8080/api/relationships | grep -q 'neighbor' && fail "unscoped graph leaked scoping fields"

echo "[validate-loop] viewer sweep…"
# node >= 22.6 is required for --experimental-strip-types to run the .mts sweep directly.
node --experimental-strip-types scripts/viewer_sweep.mts || fail "viewer sweep"
echo "[validate-loop] recipe sweep…"
node --experimental-strip-types scripts/recipe_sweep.mts || fail "recipe sweep"
echo "[validate-loop] mock_etl_data --check…"
node --experimental-strip-types scripts/mock_etl_data.mts --check || fail "mock_etl_data drift"
echo "[validate-loop] relationships sweep…"
node --experimental-strip-types scripts/relationships_sweep.mts || fail "relationships sweep"
echo "[validate-loop] backend loop OK — running frontend hook tests…"
( cd frontend && pnpm test )
echo "[validate-loop] PASS"
