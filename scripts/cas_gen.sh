#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
CORPUS=parser/src/main/resources/xmltobq
node --experimental-strip-types scripts/mock_etl_data.mts --emit xml
TMP=$(mktemp -d)
mkdir -p "$TMP/xmltobq"
for f in $(cd "$CORPUS" && ls */m_CAS_*.xml */m_CAS_*.XML 2>/dev/null); do
  mkdir -p "$TMP/xmltobq/$(dirname "$f")"
  cp "$CORPUS/$f" "$TMP/xmltobq/$f"
done
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $TMP/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
# Regenerating wipes each m_CAS_* output dir — but the recipe write API (PUT/rollback)
# archives user edits into a _history/ sidecar INSIDE that same dir. Stash any sidecar
# across the wipe so a corpus regen never destroys a user's saved edit history.
HIST=$(mktemp -d)
for d in $(cd "$TMP/xmltobq" && find . -type d -name 'm_CAS_*'); do
  rel=${d#./}
  if [ -d "$CORPUS/$rel/_history" ]; then
    mkdir -p "$HIST/$rel"
    mv "$CORPUS/$rel/_history" "$HIST/$rel/_history"
  fi
  rm -rf "$CORPUS/$rel"
  cp -R "$TMP/xmltobq/$rel" "$CORPUS/$rel"
  if [ -d "$HIST/$rel/_history" ]; then
    mv "$HIST/$rel/_history" "$CORPUS/$rel/_history"
  fi
done
rm -rf "$HIST"
echo "cas-gen: recipes regenerated from $TMP into $CORPUS"
