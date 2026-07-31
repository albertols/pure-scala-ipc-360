# ADR-0007: GUI-saved recipes are the source of truth after first edit

**Status:** Accepted

## Context

Tab 2 (ETL Modifier) can now write `_ETL_*.json` recipes back to the corpus (`PUT`/`validate`/`history`/`rollback` on `/api/recipes`, sub-project 3). Recipes are also the parser's regeneration output: `make regen-corpus`/the parser CLI can rewrite the same files from the source XML at any time. Once a user edits a recipe through the GUI, its relationship to its XML origin needs a stated direction.

## Decision

A GUI-saved recipe forks from its XML origin at first edit and is the source of truth thereafter — the write API never reads or re-derives from XML. Every `PUT`/rollback archives the prior content to `<recipeDir>/_history/_ETL_<name>.<yyyyMMdd-HHmmss-SSS>.json` before writing (committable — the user's own edit history). `make regen-corpus` overwriting a GUI-edited recipe is a known risk, documented in the `regen-corpus` skill and root `README.md`, not guarded in code in v1.

## Consequences

- Editing stays simple: one file is truth, no merge/round-trip logic against the XML.
- History/Rollback undo GUI mistakes but not a `regen-corpus` run clobbering an edited recipe — a documented gotcha, not a code gate, in v1.
- Follow-up (v2 candidate): a regen-lock marker or pre-regen diff-and-warn step, once real usage shows how often this actually bites.

## Alternatives considered

- **Regen-lock file** (mark GUI-edited recipes so `regen-corpus` skips/warns) — the correct long-term fix, deferred; no code-level lock exists in v1.
- **XML round-trip editing** (write GUI edits back into the source XML; recipe stays purely derived) — much larger scope, and the recipe, not the XML, is the platform-agnostic artifact this project is built around.
