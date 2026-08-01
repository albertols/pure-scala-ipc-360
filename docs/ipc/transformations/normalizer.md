# `normalizer`

## What IPC says

The Normalizer is IPC's own transformation type (`<TRANSFORMATION TYPE="Normalizer">`),
converting a single occurring-multiple-times record layout into multiple output rows.
IPC's own references, cited by the two rules below: overview —
[https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation.html](https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation.html)
— and generated keys —
[https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation/normalized-fields/generated-keys.html](https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation/normalized-fields/generated-keys.html).

## What the parser emits

- **Target**: `NormalizerTarget(name: String, `type`: String = "normalizer",
  normalizedFields: List[NormalizedField], fields: List[Field])` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:58-61`, where
  `NormalizedField(name: String, refSource: List[String], generatedColumnId: Boolean =
  false, generatedKey: Boolean = false)` is `AbstractTarget.scala:75-78`. Built by
  `AbstractTargetFactory.createNormalizerTarget` (`AbstractTargetFactory.scala:133-160`):
  walks the Normalizer's own un-normalized `SOURCEFIELD`s (`Source.scala:35-81`,
  `Transformation.scala:22`), and for each one collects every `Input`-typed
  `TRANSFORMFIELD` whose `REF_SOURCE_FIELD` matches it (`:138-143`) into `refSource`,
  flagging `generatedKey`/`generatedColumnId` when the source field occurs more than
  once **and** a matching `GENERATED KEY`/`GENERATED COLUMN ID`-typed port exists
  (`:144-151`). This folding is the parser-level information loss `IPC-REF-002`'s
  corpus evidence describes (`AbstractTargetFactory.scala:144-152`, `rules.md#ipc-ref-002`):
  a GENERATED KEY/COLUMN ID port's own real XML name is discarded, folded into one
  `normalizedFields` entry keyed by the base field name only.
- **Source**: `NormalizerSource(name: String, `type`: String = "normalizer")` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:39-40`. A bare
  name (`AbstractSourceFactory.createNormalizerSource`, `AbstractSourceFactory.scala:92-93`).

JSON keys: `name`, `type`, `fields[]` (target only), `normalizedFields[]` (target-only,
required — `IPC-TYP-NORMALIZER-001`, `rules.md#ipc-typ-normalizer-001`; every entry's
`refSource` must be non-empty — `IPC-TYP-NORMALIZER-002`, `rules.md#ipc-typ-normalizer-002`).
Each `normalizedFields[]` entry is `{ name, refSource, generatedColumnId, generatedKey }`.

## Recipe JSON shape

Verbatim, `DWH/m_DWH_E_LKP_DIR_PHONELIST/_ETL_m_DWH_E_LKP_DIR_PHONELIST.json:503-539`,
showing both a single-`refSource` field (no occurrence-splitting) and a multi-`refSource`
field with `generatedColumnId`/`generatedKey` both true:

```json
"target" : {
  "name" : "UPPERPEAK",
  "type" : "normalizer",
  "normalizedFields" : [
    {
      "name" : "ID_MEMBER",
      "refSource" : [ "ID_MEMBER_in" ],
      "generatedColumnId" : false,
      "generatedKey" : false
    },
    {
      "name" : "NUM_ELMCROFT_OAKHOLLOW",
      "refSource" : [ "NUM_ELMCROFT_OAKHOLLOW_in1", "NUM_ELMCROFT_OAKHOLLOW_in2" ],
      "generatedColumnId" : true,
      "generatedKey" : true
    }
  ]
}
```

## Corpus occurrences

**4** target occurrences, **4** source occurrences. No anonymizer token — `normalizer`
survives as the literal string in the committed corpus.

## Rules

- `IPC-TYP-NORMALIZER-001` — target must specify `normalizedFields` as an array
  (`rules.md#ipc-typ-normalizer-001`).
- `IPC-TYP-NORMALIZER-002` — every `normalizedFields[].refSource` must reference at
  least one input field (`rules.md#ipc-typ-normalizer-002`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — `IPC-REF-002`'s normalizer-namespace resolution
  (`rules.md#ipc-ref-002`) is specifically about this kind's `normalizedFields` as a
  downstream-visible reference target, and its corpus evidence documents the one gap
  this rule cannot close (the GENERATED KEY/COLUMN ID name loss above).
