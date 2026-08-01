# `aggregator`

## What IPC says

The Aggregator is IPC's own transformation type (`<TRANSFORMATION TYPE="Aggregator">`),
performing aggregate calculations grouped by its Group By ports —
`IPC-TYP-AGGREGATOR-001` cites IPC's own reference:
[https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/aggregator-transformation/group-by-ports.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/aggregator-transformation/group-by-ports.html).

## What the parser emits

- **Target**: `AggregatorTarget(name: String, `type`: String = "aggregator",
  groupByFields: List[String], fields: List[Field])` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:37-40`. Built
  by `AbstractTargetFactory.createAggregatorTarget` (`AbstractTargetFactory.scala:91-102`):
  `groupByFields` is every `TRANSFORMFIELD` whose `expressionType` (`Transformation.scala`'s
  `EXPRESSIONTYPE` attribute) equals `"GROUPBY"` (`RecipeConstants.GroupBy`,
  `RecipeConstants.scala:20`).
- **Source**: `AggregatorSource(name: String, `type`: String = "aggregator")` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:32-33`. A bare
  name (`AbstractSourceFactory.createAggregatorSource`, `AbstractSourceFactory.scala:84-85`).

JSON keys: `name`, `type`, `fields[]` (target only), `groupByFields[]` (target-only,
required — `IPC-TYP-AGGREGATOR-001`, `rules.md#ipc-typ-aggregator-001`).

## Recipe JSON shape

Verbatim, `DWH/m_LOAD_HIER_GRADING_MIS/_ETL_m_LOAD_HIER_GRADING_MIS.json:81-101`
(truncated after the second of many `fields[]` entries — the array and the enclosing
`target` object both continue well past line 101 in the real file):

```json
"target" : {
  "name" : "AGG_LOAD_HIER_GRADING_MIS_MAPLEFIELD",
  "type" : "aggregator",
  "groupByFields" : [
    "ID_NUM_GRADING"
  ],
  "fields" : [
    {
      "name" : "ID_RECORD",
      "dataType" : "BigDecimal",
      "transformation" : { "source" : "SQ_LOAD_HIER_GRADING_MIS.ID_RECORD" }
    },
    {
      "name" : "ID_NUM_GRADING",
      "dataType" : "BigDecimal",
      "transformation" : { "source" : "SQ_LOAD_HIER_GRADING_MIS.ID_NUM_GRADING" }
    },
    "…"
  ]
}
```

## Corpus occurrences

**6** target occurrences, **6** source occurrences. No anonymizer token — `aggregator`
survives as the literal string in the committed corpus.

## Rules

- `IPC-TYP-AGGREGATOR-001` — `groupByFields` must be an array
  (`rules.md#ipc-typ-aggregator-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply.
