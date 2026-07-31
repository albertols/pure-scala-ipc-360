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
for d in $(cd "$TMP/xmltobq" && find . -type d -name 'm_CAS_*'); do
  rm -rf "$CORPUS/${d#./}"
  cp -R "$TMP/xmltobq/${d#./}" "$CORPUS/${d#./}"
done
echo "cas-gen: recipes regenerated from $TMP into $CORPUS"
