# `sourceQualifier`

## What IPC says

The Source Qualifier is IPC's own transformation type (`<TRANSFORMATION TYPE="Source
Qualifier">`), representing the SQL query IPC issues against a relational source —
`sourceFilter`/`sqlQuery`/`userDefinedJoin`/`selectDistinct` map directly onto its
"Source Filter", "SQL Query", "User Defined Join" and "Select Distinct" properties. The
rule catalogue carries no `ipcRef` for either `IPC-TYP-SOURCEQUALIFIER-001` or the
`source:sourceQualifier` key schema (both blank in `ipc-rules.json`) — no verified
Informatica transformation-guide URL is cited here; see the provenance policy in
`README.md` for why an uncited claim isn't added speculatively.

## What the parser emits

Two case classes, one per direction — this is the one kind that carries meaningfully
different shapes on each side, since the target side holds the SQL properties and the
source side is a bare name:

- **Target**: `SourceQualifierTarget(name: String, `type`: String = "sourceQualifier",
  sourceFilter: Option[String] = None, sqlQuery: Option[String] = None,
  userDefinedJoin: Option[String] = None, selectDistinct: Boolean = false, fields:
  List[Field])` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:20-26`.
  Built by `AbstractTargetFactory.createSourceQualifierTarget`
  (`AbstractTargetFactory.scala:57-70`), reading the `"Source Filter"`/`"Sql Query"`/
  `"User Defined Join"`/`"Select Distinct"` `TABLEATTRIBUTE`s
  (`XMLDataUtils.getTableAttributeValue`, `XMLDataUtils.scala:129-136`).
- **Source**: `SourceQualifierSource(name: String, `type`: String = "sourceQualifier")`
  — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:16-17`. Just
  a name — `AbstractSourceFactory.createSourceQualifierSource`
  (`AbstractSourceFactory.scala:70-71`) is a one-line pass-through of the instance name.

JSON keys: `name`, `type`, `fields[]` (target only), `sourceFilter?`, `sqlQuery?`,
`userDefinedJoin?` (all target-only, all `Option`), `selectDistinct` (target-only,
required boolean — `IPC-TYP-SOURCEQUALIFIER-001`, `rules.md#ipc-typ-sourcequalifier-001`).

## Recipe JSON shape

Verbatim, both directions from the same recipe — the target
(`CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json:561-573`, `fields[]` truncated
to its first of many entries — the array and the enclosing `target` object both
continue past line 573 in the real file) and, in a different step of the same file, the
full `sources[]` entry that references it (`:553-558`). `type` survives here under the
anonymizer token `BERYLFALLS` (`README.md`'s alias table):

```json
"target" : {
  "name" : "SQ_ff_BIZLINK",
  "type" : "BERYLFALLS",
  "sqlQuery" : "SELECT * FROM ff_BIZLINK WHERE DATE(FCH_TIMESTAMP) = (SELECT MAX(DATE(FCH_TIMESTAMP)) FROM ff_BIZLINK)",
  "selectDistinct" : false,
  "fields" : [
    {
      "name" : "FCH_DATAENTRY",
      "dataType" : "String",
      "transformation" : { "source" : "FF_BIZLINK.FCH_DATAENTRY" }
    },
    "…"
  ]
}
```

```json
"sources" : [
  { "name" : "SQ_ff_BIZLINK", "type" : "BERYLFALLS" }
]
```

## Corpus occurrences

**86** target occurrences, **95** source occurrences — always under the anonymizer
token `BERYLFALLS` in this corpus (`IpcVocabulary.TYPE_ALIASES`); the canonical string
`sourceQualifier` never appears literally as a `type` value in the committed JSON.

## Rules

- `IPC-TYP-SOURCEQUALIFIER-001` — `selectDistinct` must be a boolean
  (`rules.md#ipc-typ-sourcequalifier-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply to every kind including this one.
