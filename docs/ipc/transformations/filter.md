# `filter`

## What IPC says

The Filter is IPC's own transformation type (`<TRANSFORMATION TYPE="Filter">`,
`RecipeConstants.Filter = "Filter"`, `RecipeConstants.scala:10`), passing rows through
only when its condition evaluates true. The rule catalogue carries no `ipcRef` for this
kind — neither `target:filter` nor `source:filter`'s key schema entries in
`ipc-rules.json` carry a `ruleId`, so there is no catalogue rule (and therefore no
citation slot) attached to it; see the provenance policy in `README.md`.

## What the parser emits

- **Target**: `FilterTarget(name: String, `type`: String = "filter", filterCondition:
  Option[RecipeTransformation] = None, fields: List[Field])` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:28-31`. Built
  by `AbstractTargetFactory.createFilterTarget`
  (`AbstractTargetFactory.scala:72-78`), which reads the `"Filter Condition"`
  `TABLEATTRIBUTE` and — if present — parses it into a full expression tree via
  `FilterParsing.parseExpression` (same recursive grammar `expressions.md` documents for
  field transformations), not just a flat string.
- **Source**: `FilterSource(name: String, `type`: String = "filter")` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:23-24`. A bare
  name (`AbstractSourceFactory.createFilterSource`, `AbstractSourceFactory.scala:73`).

JSON keys: `name`, `type`, `fields[]` (target only), `filterCondition?` (target only, an
`Option[RecipeTransformation]` — so when present it is a nested call-tree object per
`expressions.md`, not a plain string).

## Recipe JSON shape

Verbatim, `DWH/m_OAKCOMBE3_ODS_TEZ52/_ETL_m_OAKCOMBE3_ODS_TEZ52.json:52-69` (target) and
`:45-50` (a downstream step's `sources[]` reference to it):

```json
"target" : {
  "name" : "maplefield_OAKCOMBE3_ODS_TEZ52_FIL_ERROR_TEZ52",
  "type" : "filter",
  "filterCondition" : {
    "name" : "EXP_OAKPEAK",
    "parameters" : [
      { "source" : "LOAD_DATA" },
      { "value" : "=" },
      { "value" : "'Y'" }
    ]
  },
  "fields" : [ "…" ]
}
```

```json
"sources" : [ { "name" : "maplefield_OAKCOMBE3_ODS_TEZ52_FIL_ERROR_TEZ52", "type" : "filter" } ]
```

## Corpus occurrences

**23** target occurrences, **23** source occurrences. No anonymizer token — `filter`
survives as the literal string in the committed corpus.

## Rules

No `IPC-TYP-FILTER-*` id exists — a missing required key would surface only under
`IPC-TYP-REQUIRED-KEYS` (`rules.md#ipc-typ-required-keys`). The structural family
(`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`, `rules.md`) apply.
`filterCondition`'s own expression tree, when present, is additionally governed by the
`IPC-EXP-*` family (`expressions.md`, `rules.md`).
