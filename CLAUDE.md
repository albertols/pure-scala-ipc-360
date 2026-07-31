# CLAUDE.md

## What this is

ETL 360: Informatica PowerCenter (IPC) Powermart XML exports made browsable and
platform-agnostic. A multi-module Maven repo:

- `parser/` — pure Scala 2.12 (JDK 11 target) XML→JSON parser, the original standalone
  tool, unchanged in behavior. Produces `_ETL_<mapping>.json` recipes, `<TABLE>.json`
  BigQuery DDL, and `_sqlTranslations_ETL_<mapping>.json` Oracle→BigQuery SQL.
- `backend/` — Spring Boot 3.3 / Java 17 read-only REST API that calls the parser
  in-JVM and serves the corpus (tree, DOM, semantic model, recipes, DDL, expressions,
  table relationships, mock operational job history).
- `frontend/` — React 19 / Vite / Tailwind v4 GUI (Figma Make prototype), being wired
  to `backend/` tab by tab. Tab 1 (IPC ETL Viewer) and Tab 2 (ETL Modifier) are real
  now — Tab 1's canvas/detail panel/search/zoom and Tab 2's recipe canvas, designer
  palette, click-wire editing, save/history/rollback all consume the live corpus,
  including the backend's first write API (`PUT`/`validate`/`history`/`rollback` on
  `/api/recipes`); Tabs 3–4 land via separate parallel streams.
- `docs/` — ADRs, `architecture.md`, and `superpowers/{specs,plans}/` design artifacts.

No Spark, GCS, or xlsx dependencies in `parser/` — deliberately removed in the slim
pass; do not reintroduce them.

## Repo layout

| Dir | What |
|---|---|
| `parser/` | Scala parser + corpus (`src/main/resources/xmltobq`), Maven module |
| `backend/` | Spring Boot API, Maven module, depends on `parser` |
| `frontend/` | Vite/React GUI, own `package.json` |
| `docs/adr/` | Architecture Decision Records (MADR-lite) |
| `docs/architecture.md` | Diagrams, endpoint table, config reference |
| `docs/superpowers/{specs,plans}/` | Design specs and checkbox-tracked implementation plans |
| `scripts/`, `Makefile` | Dev harness |

## Build & run

```bash
make dev                                    # backend :8080 + frontend :8443, Ctrl-C stops both
mvn -q -am -pl backend test                 # all backend tests (parser + backend, full reactor)
mvn -q -pl backend test                     # focused backend re-run — no -am, needs a prior install
cd frontend && pnpm test                    # frontend unit/component tests (vitest)
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath <file-or-dir> --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
```

- `make dev` runs `mvn -am -pl backend install -DskipTests` then `spring-boot:run` scoped
  to `backend` — a multi-module reactor and the `spring-boot:run` goal don't mix directly.
- `--generateDDLContent` must accompany `--generateTargetDDL`/`--generateSourceDDL`, else
  DDL files are written empty-handed.
- Parser output is written **next to each input XML**. Never run generation against
  `parser/src/main/resources/xmltobq` in place — use `make regen-corpus` (temp copy + diff).
- Full endpoint table, config keys, and diagrams: `docs/architecture.md`.

## Hard rules

1. **Figma visual contract.** `frontend/`'s look (tokens in `src/index.css`, Inter/
   JetBrains Mono, layout/interactions) is sacred. Rewiring swaps data sources only —
   no restyling without an explicit ask. See `docs/adr/0005-figma-visual-contract.md`.
2. **Corpus safety.** `parser/src/main/resources/xmltobq/` is anonymized sample data;
   outputs sit next to inputs. Experiment in temp copies. `DWH_CONTROL/` stays
   git-ignored, never committed.
3. **Parser behavior unchanged.** Recipe/DDL/SQL generation must stay byte-identical;
   fix bugs in `parser/`, never hand-patch generated JSON. SQL translations are
   **derived artifacts** — fix `parser/.../sql/calcite` or `sql/sqlglot`, not the JSON.
   Manual overrides: `parser/src/main/resources/xmltobq/_sqlTranslations_manual.json`.
   Recipe source field references use `SOURCE_NAME.FIELD_NAME` dot notation — preserve
   it when generating or editing recipe output.
4. **Specs and plans live in `docs/superpowers/`**; progress is tracked by `- [ ]`
   checkboxes committed alongside each task's changes — the commit history is the
   resumability record. New architectural decisions get an ADR (`docs/adr/`, template
   at `0000-template.md`).

## Testing

- `make test` = `mvn -am -pl backend test` + `cd frontend && pnpm test`.
- **Corpus contract test** (`backend/.../CorpusContractTest`, JUnit): every XML in the
  corpus serves `/api/mappings/dom` and `/model` with 200 (≥69 mappings — 55 lowercase
  `.xml` + 14 uppercase `.XML`, real corpus + the synthetic `SYN` family); every
  `_ETL_*.json` recipe serves via `/api/recipes` (≥74). This replaces the old manual
  "regenerate and eyeball" smoke check.
- Parser regression is verified once at the module move (Task 1: pre/post-move
  byte-diff of full corpus regeneration) plus the ongoing corpus contract test above —
  there is no standing JUnit regen-diff harness.
- `make check` adds `tsc --noEmit` + `pnpm format --check` (frontend format backlog
  documented in root `README.md`; it doesn't fail the target while that backlog exists).
- `make validate-loop` (`scripts/validate_loop.sh`) is the frontend→middleware→backend
  gate: boots the backend, curls `/api/health`, `/api/relationships`,
  `/api/operational/dates`/`{date}` over the committed synthetic mock operational data
  (`SYN`-marked mappings, mock `LayerToLayerConfig`, 14-day b15 job history), then runs
  the frontend hook tests — see `docs/adr/0006-synthetic-operational-data.md`.
- `make validate-loop` also runs `node --experimental-strip-types
  scripts/mock_etl_data.mts --check` (manifest↔corpus↔mock drift over the `m_CAS_*`
  family) and `scripts/relationships_sweep.mts` (asserts every CAS relationship
  casuistic — fan-in, 1→N, diamond converge, lookup edge, source-only table,
  consumer-less recipe, ≥6-hop chain, anchor-date KO — against the live
  `/api/relationships` + `/api/operational/summary`), both before the frontend hook
  tests — see `docs/adr/0008-manifest-driven-cas-mock-data.md`.

## Corpus caveats

- Everything under `parser/src/main/resources/xmltobq` is **anonymized** sample data
  (names like MAPLEGROVE/CEDARFORGE are deliberate). Never "fix" them back to
  real-looking identifiers.
- The committed recipe JSONs were anonymized *after* generation, including some JSON
  key names — regenerated output legitimately differs from committed JSONs in those
  renamed keys. Do not treat that diff as a parser bug.
- The anonymizer once mangled XML entities (`&gt;` → `&southford;` etc.); that is
  repaired. A new XML failing SAX parsing with an undeclared-entity error should be
  suspected of anonymizer damage first, not the parser.
- `parser/src/main/resources/DWH_CONTROL/` is intentionally untracked (git-ignored,
  history rewritten); never commit it. The committed mock mirror lives at
  `backend/src/main/resources/mock/DWH_CONTROL/` instead.
- The anonymizer had also renamed the recipe structural key "fields" to "weststone" in
  64 recipes; repaired 2026-07-31 (key rename only, byte-diff limited to the key
  token). The frontend recipe adapter still tolerates both spellings defensively.
- The 12 `m_CAS_*` mappings (all 8 layers, corpus floors 81 XMLs/86 recipes/33 L2L
  entries) are **generated**, not hand-authored — every byte derives from
  `scripts/mock_etl_data.manifest.json` via `scripts/mock_etl_data.mts`. Regenerate
  ONLY via `make cas-gen` (XML + real-parser recipes, temp-copy idiom) and
  `--emit l2l`/`--emit b15` (L2L rows / b15 history, marker-delimited strip-then-append
  — both byte-idempotent). Never hand-edit a `m_CAS_*` XML, recipe, L2L row, or b15
  CSV row directly; see the `mock-etl-data` skill.
- `scripts/gen_b15_history.py` is **frozen** as of the CAS family landing: its
  per-recipe profiles index off `sorted(set(recipe_filenames))` across all layers'
  `statements.sql`, so adding the 12 CAS recipe names shifts every index after the
  insertion point — re-running it would silently rewrite the existing SYN/real b15
  rows. CAS b15 rows are owned exclusively by `mock_etl_data.mts --emit b15`.

## More

- API endpoints, sequence diagrams, config reference: `docs/architecture.md`
- Design rationale: `docs/adr/0001`–`0007`
- Current spec/plan: `docs/superpowers/specs/2026-07-29-etl360-foundation-design.md`,
  `docs/superpowers/plans/2026-07-29-etl360-foundation.md`,
  `docs/superpowers/specs/2026-07-30-synthetic-operational-data-design.md`,
  `docs/superpowers/plans/2026-07-30-synthetic-operational-data.md`
- Parser deep-dive: `parser/src/main/scala/io/pure360/ipc/xmltojson/README.md`,
  `_DWH_Transformations_and_XML_Parsing.md`
- Dev harness, prerequisites, `.env.example` reference: root `README.md`
