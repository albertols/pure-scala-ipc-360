#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
CORPUS=parser/src/main/resources/xmltobq
TMP=$(mktemp -d)
rsync -a --include='*/' --include='*.xml' --include='*.XML' --exclude='*' "$CORPUS/" "$TMP/xmltobq/"
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $TMP/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
echo "--- diff vs committed corpus (anonymized-key diffs in recipes are EXPECTED, see CLAUDE.md) ---"
diff -r "$CORPUS" "$TMP/xmltobq" || true
echo "--- regenerated into $TMP/xmltobq (left in place for inspection) ---"
