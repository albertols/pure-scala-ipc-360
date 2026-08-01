# `storedProcedure`

## What IPC says

The Stored Procedure is IPC's own transformation type (`<TRANSFORMATION TYPE="Stored
Procedure">`), calling a pre-existing database stored procedure, connected or
unconnected in the mapping. IPC's own reference, cited by `IPC-TYP-STOREDPROCEDURE-001`:
[https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/stored-procedure-transformation/stored-procedure-transformation-overview/connected-and-unconnected.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/stored-procedure-transformation/stored-procedure-transformation-overview/connected-and-unconnected.html).

## What the parser emits

- **Target**: `StoredProcedureTarget(name: String, `type`: String =
  "storedProcedure", procedureName: String, returnField: Option[String], fields:
  List[Field])` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:85-89`.
  Built by `AbstractTargetFactory.createStoredProcedureTarget`
  (`AbstractTargetFactory.scala:179-187`): `procedureName` reads the `"Stored Procedure
  Name"` `TABLEATTRIBUTE`, defaulting to `""` when absent; `returnField` is whichever
  `TRANSFORMFIELD` has `PORTTYPE` containing `"RETURN"` (`RecipeConstants.Return`,
  `RecipeConstants.scala:12`).
- **Source**: `StoredProcedureSource(name: String, `type`: String =
  "storedProcedure")` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:45-46`.
  A bare name (`AbstractSourceFactory.createStoredProcedureSource`,
  `AbstractSourceFactory.scala:97-98`).

JSON keys: `name`, `type`, `fields[]` (target only), `procedureName` (target-only,
required string — `IPC-TYP-STOREDPROCEDURE-001`, `rules.md#ipc-typ-storedprocedure-001`),
`returnField?` (target-only, `Option[String]`).

## Recipe JSON shape

Verbatim, `QDM/m_GENERATE_ERROR_BRISKGROVE/_ETL_m_GENERATE_ERROR_BRISKGROVE.json:78-99`.
`type` survives here under the anonymizer token `CEDARWICK2` (`README.md`'s alias
table):

```json
"target" : {
  "name" : "SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN",
  "type" : "CEDARWICK2",
  "procedureName" : "SWIFTVALE_BIRCHMILL_OAKFORD.P_MAIN",
  "returnField" : "RETURN_VALUE",
  "fields" : [
    {
      "name" : "P_ID_TIMESPAN",
      "dataType" : "BigDecimal",
      "transformation" : { "source" : "SQ_CHECK_TEALCLIFF.ID_NAVYGLADE" }
    },
    {
      "name" : "P_ID_CONTROL",
      "dataType" : "BigDecimal",
      "transformation" : { "value" : "NULL" }
    }
  ]
}
```

## Corpus occurrences

**1** target occurrence, **1** source occurrence — both under the anonymizer token
`CEDARWICK2` in this corpus (`IpcVocabulary.TYPE_ALIASES`) — the canonical string
`storedProcedure` never appears literally as a `type` value in the committed JSON.

## Rules

- `IPC-TYP-STOREDPROCEDURE-001` — target must specify `procedureName`
  (`rules.md#ipc-typ-storedprocedure-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — `IPC-REF-002`'s storedProcedure-namespace resolution
  (`rules.md#ipc-ref-002`) is specifically about `returnField` as a downstream-visible
  reference target.
