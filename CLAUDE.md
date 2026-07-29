# CLAUDE.md

## What this is

Standalone Informatica PowerCenter (IPC) XML → ETL-recipe parser, extracted and slimmed
from the internal `spark-etl` project. It parses IPC Powermart XML exports into:

- `_ETL_<mapping>.json` — platform-agnostic transformation recipe (circe JSON)
- `<TABLE>.json` — BigQuery DDL schema per source/target
- `_sqlTranslations_ETL_<mapping>.json` — Oracle→BigQuery SQL translations (only when the mapping has SQL)

Pure Scala 2.12 / JDK 11. No Spark, BigQuery, GCS, or xlsx dependencies — those were
deliberately removed in the slim pass; do not reintroduce them.

## Build & run

```bash
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath <file-or-dir> --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
```

- `--generateDDLContent` must accompany `--generateTargetDDL`/`--generateSourceDDL`, otherwise DDL files are created empty-handed and downstream steps that read them fail.
- Outputs are written **next to each input XML**, in a directory named after the mapping. When experimenting, copy XMLs to a temp dir instead of running against `parser/src/main/resources/xmltobq` (that would overwrite the committed corpus outputs).
- Smoke check: running over the full corpus (46 XMLs) must produce 46 `_ETL_*.json` recipes and exit 0. `CalciteSqlTranslator - Exception during SQL parsing` log errors are expected fallback noise on untranslatable Oracle SQL, not failures.
- There is no test suite; verification is regenerating corpus outputs into a temp dir and comparing.

## Architecture

Everything lives under `parser/src/main/scala/io/pure360/ipc/`:

- `xmltojson/` — the parser. `XMLParser` (entry point/CLI), `XMLReplacementExecutor` (pre-parse XML preparation: legacy flow renames), `XmlParserConstants`.
  - `nodes/` — XML node model (`XMLRoot.parsePowermart`, Source, Target, Mapping, Mapplet, Transformation, Folder)
  - `recipe/` — recipe generation (`RecipeGenerator`, expression/filter parsing, source/target factories)
  - `sql/` — SQL translation: `SqlTranslatorGenerator` + two backends, Apache Calcite (`calcite/`) and SqlGlot (`sqlglot/`)
  - `utils/` — `XMLDataUtils` (type mappings, DDL JSON generation), `ExpressionParserUtils`
- `model/` — recipe/enum case classes; `json/JsonCodecs` — circe encoders/decoders
- `utils/`, `scalamatica/` — small residual helpers (file utils, `SingleLayerEnum`, `DateTimeUtils`)

Package docs: `xmltojson/README.md` (CLI, type-mapping tables, XML preparation rules) and
`xmltojson/_DWH_Transformations_and_XML_Parsing.md` (parsing algorithm deep-dive).

## Rules

- Recipe source field references use `SOURCE_NAME.FIELD_NAME` dot notation — preserve it when generating or editing recipe output.
- SQL translations are **derived artifacts**: when a translated statement is wrong, fix the translation backend (`sql/calcite` or `sql/sqlglot`), never hand-patch generated JSON.
- Manual translation overrides go in `parser/src/main/resources/xmltobq/_sqlTranslations_manual.json` (`"mapping.transformation" -> sql`); the file is optional.

## Corpus caveats

- Everything under `parser/src/main/resources/xmltobq` is **anonymized** sample data (names like MAPLEGROVE/CEDARFORGE are deliberate). Never "fix" them back to real-looking identifiers.
- The committed recipe JSONs were anonymized *after* generation, including some JSON key names — so regenerated output legitimately differs from committed JSONs in those renamed keys. Do not treat that diff as a parser bug.
- The anonymizer once mangled XML entities (`&gt;` → `&southford;` etc.); that is repaired. If a new XML fails SAX parsing with an undeclared-entity error, suspect anonymizer damage first, not the parser.
- `parser/src/main/resources/DWH_CONTROL/` is intentionally untracked (git-ignored, history rewritten); never commit it.
