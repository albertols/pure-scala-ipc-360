# `table`

## What IPC says

A `table` step target/source is not an IPC *transformation* at all — it is IPC's
**Target Definition** / **Source Definition**, the schema object a mapping reads from
or writes to (`RecipeConstants.SourceDefinition = "Source Definition"`,
`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeConstants.scala:9`). The
rule catalogue carries no kind-specific `ipcRef` for `table` (see `IPC-STR-005`,
`rules.md#ipc-str-005`, for the general "known kind" citation covering every kind
including this one) — there is no dedicated IPC transformation-guide page for a Target/
Source Definition the way there is for, say, Router or Aggregator, because IPC itself
doesn't classify it as a transformation.

## What the parser emits

Two distinct case classes share the `type: "table"` discriminator, one per direction:

- **Target**: `TableTarget(name: String, `type`: String = "table", primaryKeys:
  Option[List[String]] = None, updateOverride: Option[String] = None, fields:
  List[Field])` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:10-14`.
  `primaryKeys` is populated from `TARGETFIELD@KEYTYPE` containing `PRIMARY`
  (`AbstractTargetFactory.createTableTarget`, `AbstractTargetFactory.scala:36-49`, the
  `.filter(_.keyType.contains(Primary))` at `:42`; `Target.scala:36-49` parses the
  underlying `TARGETFIELD`). `updateOverride` reads the `"Update Override"`
  `TABLEATTRIBUTE`, same method, line `:46` — an `Option` that is `None` throughout this
  corpus (0 of 90 occurrences).
- **Source**: `TableSource(name: String, `type`: String = "table", primaryKeys:
  Option[List[String]] = None)` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:19-21`.
  Never carries a field list (`AbstractSource` has no `fields` member — sources only ever
  name themselves; `RecipeGenerator.getCurrentCursorAndName`, `RecipeGenerator.scala:385-401`,
  walks connectors to resolve which fields a downstream step actually reads).

JSON keys: `name`, `type`, `fields[]` (target only — `fields[].name`, `fields[].dataType`,
`fields[].transformation`; `Recipe.scala:9`), `primaryKeys[]?` (both), `updateOverride?`
(target only).

## Recipe JSON shape

A `table` target with `primaryKeys`, one call-tree field and one dot-ref field —
`ODS/CLIENTMGR_ENGAGE_MEMBER_10049_2/m_ODS_ACT_GUIDE_AWAY_DAYS/_ETL_m_ODS_ACT_GUIDE_AWAY_DAYS.json:4-30`,
truncated to the first two of many `fields[]` entries — the array and the enclosing
`target` object both continue past line 30 in the real file:

```json
"target" : {
  "name" : "ODS_ACT_GUIDE_AWAY_DAYS",
  "type" : "table",
  "primaryKeys" : [
    "GUIDE_ID",
    "OPALFORK_AWAY_DATE"
  ],
  "fields" : [
    {
      "name" : "ID_RECORD",
      "dataType" : "BigDecimal",
      "transformation" : { "name" : "SequenceGenerator" }
    },
    {
      "name" : "GUIDE_ID",
      "dataType" : "String",
      "transformation" : {
        "name" : "EXP_MAPLEVALE_VARCHAR2_NOT_NULL",
        "parameters" : [ { "source" : "SQ_STG_ACT_GUIDE_AWAY_DAYS.GUIDE_ID" } ]
      }
    },
    "…"
  ]
}
```

A `table` source, no field list — the same file's full `sources[]` entry for that
step's upstream table (`:104-109`; `type` survives here under the anonymizer token
`BERYLFALLS` — see `README.md`'s alias table, and `sourceQualifier.md` for this kind):

```json
"sources" : [
  { "name" : "SQ_STG_ACT_GUIDE_AWAY_DAYS", "type" : "BERYLFALLS" }
]
```

## Corpus occurrences

**90** target occurrences (9 carrying `primaryKeys`; 0 carrying `updateOverride` — that
`Option` is `None` corpus-wide), **139** source occurrences. No anonymizer token —
`table` survives as the literal string in the committed corpus.

## Rules

No `IPC-TYP-TABLE-*` id exists — every `target:table`/`source:table` key schema entry in
`ipc-rules.json` carries no per-field `ruleId` (required-key violations, if any, would
surface only under the shared `IPC-TYP-REQUIRED-KEYS` umbrella,
`rules.md#ipc-typ-required-keys`). The structural family (`IPC-STR-001` through
`IPC-STR-009`, `rules.md`) and referential family (`IPC-REF-001` through `IPC-REF-006`,
`rules.md`) apply to every kind including this one — e.g. `IPC-REF-005`
(`rules.md#ipc-ref-005`) specifically requires `table.targetTableNames` to contain every
`type: "table"` target name.
